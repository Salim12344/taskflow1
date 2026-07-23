import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { connectDB } from "@/lib/db";
import Group from "@/models/Group";
import GroupMember from "@/models/GroupMember";
import Project from "@/models/Project";
import Task from "@/models/Task";
import Notification from "@/models/Notification";
import { isGroupAdmin, countAdmins, countPendingReviewTasks } from "@/lib/permissions";

async function projectIdsFor(groupId: string) {
  const projects = await Project.find({ groupId }, "_id");
  return projects.map((p) => p._id.toString());
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ groupId: string; userId: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { groupId, userId } = await params;
  await connectDB();
  const group = await Group.findOne({ _id: groupId, deletedAt: null });
  if (!group) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await isGroupAdmin(groupId, session.user.id, group.orgId?.toString() ?? null))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const target = await GroupMember.findOne({ groupId, userId });
  if (!target) return NextResponse.json({ error: "Not a member" }, { status: 404 });

  if (target.role === "admin" && (await countAdmins(groupId)) <= 1) {
    return NextResponse.json(
      { error: "Promote another member to admin before leaving/stepping down" },
      { status: 409 }
    );
  }

  const projectIds = await projectIdsFor(groupId);
  const assignedTasks = await Task.find({ projectId: { $in: projectIds }, assignedTo: userId, deletedAt: null });
  if (assignedTasks.length > 0) {
    await Task.updateMany(
      { _id: { $in: assignedTasks.map((t) => t._id) } },
      { $set: { assignedTo: null } }
    );
    const admins = await GroupMember.find({ groupId, role: "admin" });
    await Notification.insertMany(
      admins.map((a) => ({
        userId: a.userId,
        type: "tasks_unassigned",
        payload: { groupId, removedUserId: userId, taskIds: assignedTasks.map((t) => t._id) },
      }))
    );
  }

  await GroupMember.deleteOne({ groupId, userId });

  return NextResponse.json({ ok: true, tasksUnassigned: assignedTasks.length });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ groupId: string; userId: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { groupId, userId } = await params;
  const { role } = await req.json();
  if (!["admin", "member"].includes(role)) {
    return NextResponse.json({ error: "role must be 'admin' or 'member'" }, { status: 400 });
  }

  await connectDB();
  const group = await Group.findOne({ _id: groupId, deletedAt: null });
  if (!group) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await isGroupAdmin(groupId, session.user.id, group.orgId?.toString() ?? null))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const target = await GroupMember.findOne({ groupId, userId });
  if (!target) return NextResponse.json({ error: "Not a member" }, { status: 404 });

  if (target.role === "admin" && role === "member") {
    if ((await countAdmins(groupId)) <= 1) {
      return NextResponse.json(
        { error: "Promote another member to admin before leaving/stepping down" },
        { status: 409 }
      );
    }
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

  target.role = role;
  await target.save();

  return NextResponse.json({ member: target });
}
