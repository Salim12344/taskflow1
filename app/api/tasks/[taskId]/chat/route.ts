import { NextResponse } from "next/server";
import { auth } from "@/auth";
import TaskChatMessage from "@/models/TaskChatMessage";
import User from "@/models/User";
import { isGroupAdmin, isGroupMember, canManageTask } from "@/lib/permissions";
import { loadTaskContext } from "@/lib/task-context";
import { notify } from "@/lib/notify";

/**
 * Private to the assignee and whoever currently manages the task (the creator, or the
 * delegated manager once one's accepted) — but any group admin can read along, just not post.
 * Spec: "Private thread scoped only to the task's assignee and assigner."
 */
async function loadChatContext(taskId: string, userId: string) {
  const ctx = await loadTaskContext(taskId);
  if (!ctx?.project) return null;
  const { task, project, group } = ctx;
  const groupId = project.groupId.toString();
  const orgId = group.orgId?.toString() ?? null;

  const isMember = await isGroupMember(groupId, userId, orgId);
  if (!isMember) return null;

  const admin = await isGroupAdmin(groupId, userId, orgId);
  const isAssignee = task.assignedTo?.toString() === userId;
  const isManager = await canManageTask(task.reviewerId?.toString() ?? null, orgId, userId, task.createdBy.toString() === userId);
  const canRead = admin || isAssignee;
  // Once a task is approved it's a closed record — the thread stays readable but nobody can
  // post to it anymore, regardless of who they were to the task.
  const canWrite = task.status !== "done" && (isAssignee || (admin && isManager));

  return { task, canRead, canWrite, isAssignee, isManager };
}

export async function GET(_req: Request, { params }: { params: Promise<{ taskId: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { taskId } = await params;
  const ctx = await loadChatContext(taskId, session.user.id);
  if (!ctx) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!ctx.canRead) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const messages = await TaskChatMessage.find({ taskId }).sort({ createdAt: 1 });

  // Count messages this viewer hasn't read yet — before we mark them.
  const unreadCount = ctx.canWrite
    ? await TaskChatMessage.countDocuments({ taskId, senderId: { $ne: session.user.id }, readAt: null })
    : 0;

  // Only the two active participants' unread state matters — a passively-viewing admin
  // reading along doesn't clear anyone else's unread badge.
  if (ctx.canWrite) {
    await TaskChatMessage.updateMany(
      { taskId, senderId: { $ne: session.user.id }, readAt: null },
      { $set: { readAt: new Date() } }
    );
  }

  return NextResponse.json({ messages, canWrite: ctx.canWrite, unreadCount });
}

export async function POST(req: Request, { params }: { params: Promise<{ taskId: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { taskId } = await params;
  const { text, replyToId, attachments } = await req.json();
  const hasAttachment = Array.isArray(attachments) && attachments.length > 0;
  if (!text?.trim() && !hasAttachment) return NextResponse.json({ error: "text is required" }, { status: 400 });

  const ctx = await loadChatContext(taskId, session.user.id);
  if (!ctx) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!ctx.canWrite) {
    return NextResponse.json({ error: "Only the assignee and the task's manager can post here" }, { status: 403 });
  }

  // Snapshot the quoted message at write time — a reply shouldn't break if the original is later deleted.
  let replyTo = null;
  if (replyToId) {
    const target = await TaskChatMessage.findOne({ _id: replyToId, taskId }).populate("senderId", "name");
    if (target) {
      replyTo = { messageId: target._id, text: target.text || "📎 Attachment", senderName: (target.senderId as unknown as { name: string }).name };
    }
  }

  const message = await TaskChatMessage.create({
    taskId,
    senderId: session.user.id,
    text: text?.trim() ?? "",
    replyTo,
    attachments: hasAttachment ? attachments : [],
  });

  // Notify the other party in the task chat thread.
  // The two participants are the assignee and the task manager (createdBy or delegated reviewer).
  const { task } = ctx;
  const assigneeId = task.assignedTo?.toString() ?? null;
  const managerId = task.reviewerId?.toString() ?? task.createdBy?.toString() ?? null;
  const otherParticipantId = session.user.id === assigneeId ? managerId : assigneeId;

  if (otherParticipantId && otherParticipantId !== session.user.id) {
    const sender = await User.findById(session.user.id, "name").lean();
    const senderName = (sender as unknown as { name: string } | null)?.name ?? "Someone";
    const taskTitle = task.title ? (task.title.length > 40 ? task.title.slice(0, 40) + "…" : task.title) : "a task";
    const preview = text?.trim()
      ? text.trim().length > 50 ? text.trim().slice(0, 50) + "…" : text.trim()
      : "📎 Attachment";
    await notify(otherParticipantId, "task_chat", `${senderName} in "${taskTitle}": ${preview}`, {
      description: preview,
      payload: { taskId },
    });
  }

  return NextResponse.json({ message }, { status: 201 });
}
