import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { auth } from "@/auth";
import { connectDB } from "@/lib/db";
import Group from "@/models/Group";
import GroupMember from "@/models/GroupMember";
import Project from "@/models/Project";
import Task from "@/models/Task";
import User from "@/models/User";
import { notifyMany } from "@/lib/notify";
import { isGroupAdmin, countPendingReviewTasks, hasAnotherAdmin, isOrgOwnerOfGroup } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";

async function projectIdsFor(groupId: string) {
  const projects = await Project.find({ groupId }, "_id");
  return projects.map((p) => p._id.toString());
}

/** Forced removal auto-unassigns — the removing admin takes responsibility for the fallout. */
async function unassignActiveTasks(groupId: string, userId: string) {
  const projectIds = await projectIdsFor(groupId);
  const assignedTasks = await Task.find({ projectId: { $in: projectIds }, assignedTo: userId, deletedAt: null, status: { $ne: "done" } });
  if (assignedTasks.length === 0) return 0;

  await Task.updateMany({ _id: { $in: assignedTasks.map((t) => t._id) } }, { $set: { assignedTo: null } });
  const admins = await GroupMember.find({ groupId, role: "admin" });
  const removedUser = await User.findById(userId, "name");
  // One notification per task (not a single batched one) so each deep-links straight to the
  // task that needs reassigning instead of dropping the admin somewhere generic.
  for (const task of assignedTasks) {
    await notifyMany(
      admins.map((a) => a.userId.toString()),
      "tasks_unassigned",
      `"${task.title}" was unassigned from ${removedUser?.name ?? "a removed member"} — needs reassigning`,
      { payload: { groupId, taskId: task._id, unassignedFromUserId: userId } }
    );
  }
  return assignedTasks.length;
}

/** Promotion is blocked, not auto-unassigned — admins can never hold a task, so the promoter must clear these first. */
async function activeTaskCounts(groupId: string, userId: string) {
  const projectIds = await projectIdsFor(groupId);
  const tasks = await Task.find({ projectId: { $in: projectIds }, assignedTo: userId, deletedAt: null, status: { $ne: "done" } }, "status");
  return { total: tasks.length, pendingReview: tasks.filter((t) => t.status === "pending_review").length };
}

/**
 * A task's delegated manager (reviewerId) or an in-flight hand-off offer that points at someone
 * who's no longer an admin here (demoted or removed) would otherwise lock the task to a person
 * who can't act on it anymore — clear both back to the default (the task's creator).
 */
async function clearDelegationsFor(groupId: string, userId: string) {
  const projectIds = await projectIdsFor(groupId);
  await Task.updateMany(
    { projectId: { $in: projectIds }, reviewerId: userId, deletedAt: null },
    { $set: { reviewerId: null } }
  );
  await Task.updateMany(
    {
      projectId: { $in: projectIds },
      deletedAt: null,
      $or: [{ "pendingReviewDelegation.toUserId": userId }, { "pendingReviewDelegation.fromUserId": userId }],
    },
    { $set: { pendingReviewDelegation: null } }
  );
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ groupId: string; userId: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { groupId, userId } = await params;

  // Self-removal must go through /leave, which enforces the pending-review block — this
  // endpoint is the forceful admin-on-someone-else action and must not become a loophole.
  if (userId === session.user.id) {
    return NextResponse.json({ error: "Use the leave-group action to remove yourself" }, { status: 400 });
  }

  await connectDB();
  const group = await Group.findOne({ _id: groupId, deletedAt: null });
  if (!group) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const orgId = group.orgId?.toString() ?? null;
  if (!(await isGroupAdmin(groupId, session.user.id, orgId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const target = await GroupMember.findOne({ groupId, userId });
  if (!target) return NextResponse.json({ error: "Not a member" }, { status: 404 });

  if (await isOrgOwnerOfGroup(orgId, userId)) {
    return NextResponse.json({ error: "The organization owner can't be removed from a group they own" }, { status: 400 });
  }

  if (target.role === "admin") {
    // Guard the count-check and the removal in one transaction — otherwise two concurrent
    // removals of the last two admins can each see "another admin" (each other) and both
    // proceed, leaving the group with zero admins.
    const dbSession = await mongoose.startSession();
    try {
      await dbSession.withTransaction(async () => {
        if (!(await hasAnotherAdmin(groupId, orgId, userId, dbSession))) {
          throw new Error("NO_OTHER_ADMIN");
        }
        await GroupMember.deleteOne({ groupId, userId }).session(dbSession);
      });
    } catch (e) {
      if (e instanceof Error && e.message === "NO_OTHER_ADMIN") {
        return NextResponse.json(
          { error: "Promote another member to admin before leaving/stepping down" },
          { status: 409 }
        );
      }
      throw e;
    } finally {
      await dbSession.endSession();
    }
  } else {
    await GroupMember.deleteOne({ groupId, userId });
  }

  const tasksUnassigned = await unassignActiveTasks(groupId, userId);
  await clearDelegationsFor(groupId, userId);
  const removedUser = await User.findById(userId, "name");
  await logActivity(groupId, session.user.id, "member_removed", "user", userId, `${session.user.name} removed ${removedUser?.name ?? "a member"} from the group`);

  return NextResponse.json({ ok: true, tasksUnassigned });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ groupId: string; userId: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { groupId, userId } = await params;
  const body = await req.json();
  const { role, canDeleteGroup } = body;

  if (role === undefined && canDeleteGroup === undefined) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }
  if (role !== undefined && !["admin", "member"].includes(role)) {
    return NextResponse.json({ error: "role must be 'admin' or 'member'" }, { status: 400 });
  }

  await connectDB();
  const group = await Group.findOne({ _id: groupId, deletedAt: null });
  if (!group) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const orgId = group.orgId?.toString() ?? null;
  const isOrgOwner = session.user.accountType === "organization";

  if (!(await isGroupAdmin(groupId, session.user.id, orgId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const target = await GroupMember.findOne({ groupId, userId });
  if (!target) return NextResponse.json({ error: "Not a member" }, { status: 404 });

  // Only the organization owner can grant/revoke group deletion permissions to other admins.
  if (typeof canDeleteGroup === "boolean") {
    if (!isOrgOwner) {
      return NextResponse.json(
        { error: "Only the organization owner can grant or revoke group deletion permissions" },
        { status: 403 }
      );
    }
    if (target.role !== "admin" && (!role || role !== "admin")) {
      return NextResponse.json(
        { error: "Only admins can be granted group deletion permission" },
        { status: 400 }
      );
    }
    target.canDeleteGroup = canDeleteGroup;
  }

  if (role !== undefined && role !== target.role) {
    if (role === "member" && (await isOrgOwnerOfGroup(orgId, userId))) {
      return NextResponse.json({ error: "The organization owner can't be demoted in a group they own" }, { status: 400 });
    }

    if (target.role === "admin" && role === "member") {
      // Pending-review block only applies to self-demotion (spec: admin stepping themselves down).
      if (userId === session.user.id) {
        const projectIds = await projectIdsFor(groupId);
        const pending = await countPendingReviewTasks(projectIds);
        if (pending > 0) {
          return NextResponse.json(
            {
              error: `There are ${pending} tasks pending review in this group. Review or reassign them before you can leave or step down.`,
            },
            { status: 409 }
          );
        }
      }
    }

    // Admins can never hold an assigned task — promotion is blocked (not auto-unassigned) until
    // they finish or get reassigned off whatever they currently have.
    if (target.role === "member" && role === "admin") {
      const { total, pendingReview } = await activeTaskCounts(groupId, userId);
      if (total > 0) {
        const detail = pendingReview > 0 ? `, ${pendingReview} pending review` : "";
        return NextResponse.json(
          {
            error: `This member has ${total} task(s) pending completion${detail}. Reassign or have them finish before promoting.`,
          },
          { status: 409 }
        );
      }
    }

    const oldRole = target.role;
    if (oldRole === "admin" && role === "member") {
      target.canDeleteGroup = false;
      const dbSession = await mongoose.startSession();
      try {
        await dbSession.withTransaction(async () => {
          if (!(await hasAnotherAdmin(groupId, orgId, userId, dbSession))) {
            throw new Error("NO_OTHER_ADMIN");
          }
          await GroupMember.updateOne({ _id: target._id }, { $set: { role, canDeleteGroup: false } }).session(dbSession);
        });
      } catch (e) {
        if (e instanceof Error && e.message === "NO_OTHER_ADMIN") {
          return NextResponse.json(
            { error: "Promote another member to admin before leaving/stepping down" },
            { status: 409 }
          );
        }
        throw e;
      } finally {
        await dbSession.endSession();
      }
      target.role = role;
      await clearDelegationsFor(groupId, userId);
    } else {
      target.role = role;
      await target.save();
    }

    const targetUser = await User.findById(userId, "name");
    const verb = role === "admin" ? "promoted" : "demoted";
    await logActivity(groupId, session.user.id, `member_${verb}`, "user", userId, `${session.user.name} ${verb} ${targetUser?.name ?? "a member"}`);
  } else {
    await target.save();
  }

  return NextResponse.json({ member: target });
}
