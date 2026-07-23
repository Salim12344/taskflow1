import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { connectDB } from "@/lib/db";
import Group from "@/models/Group";
import Project from "@/models/Project";
import Task from "@/models/Task";
import TaskHistory from "@/models/TaskHistory";
import TaskChatMessage from "@/models/TaskChatMessage";
import GroupMember from "@/models/GroupMember";
import Notification from "@/models/Notification";
import { isAssignableMember, isGroupAdmin, isGroupMember } from "@/lib/permissions";
import { nextDueDate } from "@/lib/recurrence";

async function loadTaskContext(taskId: string) {
  const task = await Task.findOne({ _id: taskId, deletedAt: null });
  if (!task) return null;
  const project = await Project.findById(task.projectId);
  const group = project ? await Group.findById(project.groupId) : null;
  return { task, project, group };
}

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
  if (!(await isGroupMember(ctx.project.groupId.toString(), session.user.id))) {
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

  const admin = await isGroupAdmin(groupId, userId, group?.orgId?.toString() ?? null);
  const isAssignee = task.assignedTo?.toString() === userId;

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
      // Only admins can approve/reject.
      if (!admin) return NextResponse.json({ error: "Only an admin can approve or reject" }, { status: 403 });

      if (body.status === "in_progress") {
        // Reject
        if (!body.reason) return NextResponse.json({ error: "reason is required to reject a task" }, { status: 400 });
        task.rejectionHistory.push({ reviewerId: userId, reason: body.reason, createdAt: new Date() });
        await TaskChatMessage.create({ taskId: task._id, senderId: userId, text: body.reason });
        if (task.assignedTo) {
          await Notification.create({
            userId: task.assignedTo,
            type: "task_rejected",
            payload: { taskId: task._id, reason: body.reason },
          });
        }
      } else if (body.status === "done") {
        // Approve
        if (task.assignedTo) {
          await Notification.create({
            userId: task.assignedTo,
            type: "task_approved",
            payload: { taskId: task._id },
          });
        }
        if (task.recurrence !== "none") {
          await Task.create({
            projectId: task.projectId,
            title: task.title,
            description: task.description,
            assignedTo: task.assignedTo,
            createdBy: task.createdBy,
            deadline: nextDueDate(task.deadline, task.recurrence as "daily" | "weekly" | "monthly"),
            recurrence: task.recurrence,
            subtasks: task.subtasks.map((s: { text: string }) => ({ text: s.text, done: false })),
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
        await Notification.insertMany(
          admins.map((a) => ({
            userId: a.userId,
            type: "task_submitted",
            payload: { taskId: task._id },
          }))
        );
      }
    }

    await TaskHistory.create({ taskId: task._id, actorId: userId, field: "status", oldValue: task.status, newValue: body.status });
    task.status = body.status;
  }

  // --- Field edits (admin only) ---
  if (admin) {
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
      await TaskHistory.create({
        taskId: task._id,
        actorId: userId,
        field: "assignedTo",
        oldValue: task.assignedTo,
        newValue: body.assignedTo,
      });
      task.assignedTo = body.assignedTo ?? null;
    }
  }

  await task.save();
  return NextResponse.json({ task });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ taskId: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { taskId } = await params;
  await connectDB();
  const ctx = await loadTaskContext(taskId);
  if (!ctx?.project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { task, project, group } = ctx;

  const admin = await isGroupAdmin(project.groupId.toString(), session.user.id, group?.orgId?.toString() ?? null);
  const isCreator = task.createdBy.toString() === session.user.id;
  if (!admin && !isCreator) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  task.deletedAt = new Date();
  await task.save();

  return NextResponse.json({ ok: true });
}
