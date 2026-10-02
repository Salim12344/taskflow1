import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { connectDB } from "@/lib/db";
import Task from "@/models/Task";
import TaskHistory from "@/models/TaskHistory";
import TaskChatMessage from "@/models/TaskChatMessage";
import GroupMember from "@/models/GroupMember";
import { notify, notifyMany } from "@/lib/notify";
import { isAssignableMember, isGroupAdmin, isGroupMember, canManageTask } from "@/lib/permissions";
import { nextDueDate } from "@/lib/recurrence";
import { loadTaskContext } from "@/lib/task-context";
import { logActivity } from "@/lib/activity";
import { saveTaskOrConflict } from "@/lib/task-save";

const VALID_TRANSITIONS: Record<string, string[]> = {
  todo: ["in_progress"],
  in_progress: ["pending_review"],
  pending_review: ["done", "in_progress"],
};

export async function GET(_req: Request, { params }: { params: Promise<{ taskId: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { taskId } = await params;
  await connectDB();
  const ctx = await loadTaskContext(taskId);
  if (!ctx?.project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await isGroupMember(ctx.project.groupId.toString(), session.user.id, ctx.group?.orgId?.toString() ?? null))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({ task: ctx.task });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ taskId: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { taskId } = await params;
  const body = await req.json();

  await connectDB();
  const ctx = await loadTaskContext(taskId);
  if (!ctx?.project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { task, project, group } = ctx;
  const groupId = project.groupId.toString();
  const userId = session.user.id;

  const orgId = group?.orgId?.toString() ?? null;
  const admin = await isGroupAdmin(groupId, userId, orgId);
  const isAssignee = task.assignedTo?.toString() === userId;
  const reviewerId = task.reviewerId?.toString() ?? null;
  const isCreator = task.createdBy.toString() === userId;
  // Default manager is the admin who created/assigned the task, not "any admin" — that's the
  // whole point of delegation existing. Once delegated, control fully moves to that admin
  // (plus the org owner as a permanent emergency fallback).
  const canManage = await canManageTask(reviewerId, orgId, userId, isCreator);

  if (!admin && !isAssignee) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // --- Status transition ---
  if (body.status && body.status !== task.status) {
    const allowedNext = VALID_TRANSITIONS[task.status] ?? [];
    if (!allowedNext.includes(body.status)) {
      return NextResponse.json({ error: `Cannot move task from ${task.status} to ${body.status}` }, { status: 400 });
    }

    if (task.status === "pending_review") {
      // Only admins can approve/reject — and if this task's management has been delegated
      // to a specific admin, only they (or the org owner, as a fallback) can act.
      if (!admin) return NextResponse.json({ error: "Only an admin can approve or reject" }, { status: 403 });
      if (!canManage) {
        return NextResponse.json({ error: "Only this task's manager can approve or reject it" }, { status: 403 });
      }

      // Whoever acted resolves any outstanding hand-off offer — it's moot now.
      task.pendingReviewDelegation = null;

      if (body.status === "in_progress") {
        // Reject
        if (!body.reason) return NextResponse.json({ error: "reason is required to reject a task" }, { status: 400 });
        task.rejectionHistory.push({ reviewerId: userId, reason: body.reason, createdAt: new Date() });
        await TaskChatMessage.create({ taskId: task._id, senderId: userId, text: body.reason });
        await logActivity(groupId, userId, "task_rejected", "task", task._id.toString(), `${session.user.name} rejected "${task.title}"`);
        if (task.assignedTo) {
          await notify(
            task.assignedTo.toString(),
            "task_rejected",
            `"${task.title}" was rejected`,
            { description: body.reason, payload: { taskId: task._id, reason: body.reason } }
          );
        }
      } else if (body.status === "done") {
        // Approve
        await logActivity(groupId, userId, "task_approved", "task", task._id.toString(), `${session.user.name} approved "${task.title}"`);
        if (task.assignedTo) {
          await notify(
            task.assignedTo.toString(),
            "task_approved",
            `"${task.title}" was approved`,
            { payload: { taskId: task._id } }
          );
        }
        if (task.recurrence !== "none") {
          // The old assignee may no longer be an eligible member (left, or promoted to admin) by the time
          // the recurrence fires — don't blindly carry over an assignment that's no longer valid.
          const carryAssignee =
            task.assignedTo && (await isAssignableMember(groupId, task.assignedTo.toString())) ? task.assignedTo : null;
          await Task.create({
            projectId: task.projectId,
            title: task.title,
            description: task.description,
            assignedTo: carryAssignee,
            createdBy: task.createdBy,
            deadline: nextDueDate(task.deadline, task.recurrence as "daily" | "weekly" | "monthly"),
            recurrence: task.recurrence,
            subtasks: [],
            status: "todo",
          });
        }
      }
    } else {
      // todo -> in_progress, in_progress -> pending_review: assignee-driven
      if (!isAssignee) return NextResponse.json({ error: "Only the assignee can move this task" }, { status: 403 });
      if (body.status === "pending_review") {
        task.submittedAt = new Date();
        const admins = await GroupMember.find({ groupId, role: "admin" });
        await notifyMany(
          admins.map((a) => a.userId.toString()),
          "task_submitted",
          `${session.user.name} submitted "${task.title}" for review`,
          { payload: { taskId: task._id } }
        );
      }
    }

    await TaskHistory.create({ taskId: task._id, actorId: userId, field: "status", oldValue: task.status, newValue: body.status });
    task.status = body.status;
  }

  // --- Field edits (admin only, and only the delegated manager once one's been accepted) ---
  if (admin && canManage) {
    if (body.deadline && new Date(body.deadline) < new Date()) {
      return NextResponse.json({ error: "Deadline can't be in the past" }, { status: 400 });
    }
    const editable = ["title", "description", "deadline", "recurrence"] as const;
    for (const key of editable) {
      if (key in body) (task as Record<string, unknown>)[key] = body[key];
    }
    if ("assignedTo" in body) {
      if (body.assignedTo) {
        if (!(await isAssignableMember(groupId, body.assignedTo))) {
          return NextResponse.json({ error: "Tasks can only be assigned to a regular member, not an admin" }, { status: 400 });
        }
      }
      const oldAssignee = task.assignedTo?.toString() ?? null;
      const newAssignee = body.assignedTo ?? null;
      await TaskHistory.create({
        taskId: task._id,
        actorId: userId,
        field: "assignedTo",
        oldValue: task.assignedTo,
        newValue: body.assignedTo,
      });
      task.assignedTo = newAssignee;
      if (newAssignee && newAssignee !== oldAssignee) {
        await notify(newAssignee, "task_reassigned", `You were assigned "${task.title}"`, { payload: { taskId: task._id } });
      }
    }
  }

  const conflict = await saveTaskOrConflict(task);
  if (conflict) return conflict;
  return NextResponse.json({ task });
}

export async function DELETE() {
  return NextResponse.json({ error: "Tasks cannot be deleted" }, { status: 403 });
}
