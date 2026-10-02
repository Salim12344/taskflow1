import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { connectDB } from "@/lib/db";
import GroupMessage from "@/models/GroupMessage";
import GroupMember from "@/models/GroupMember";
import Group from "@/models/Group";
import { isGroupMember } from "@/lib/permissions";
import { notifyMany } from "@/lib/notify";
import { getTypingUsers } from "@/lib/typing";

export async function GET(_req: Request, { params }: { params: Promise<{ groupId: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { groupId } = await params;
  await connectDB();
  const activeGroup = await Group.findOne({ _id: groupId, deletedAt: null });
  if (!activeGroup) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await isGroupMember(groupId, session.user.id, activeGroup.orgId?.toString() ?? null))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Count messages this viewer hasn't read yet — before we mark them. The client uses this
  // to show an "unread divider" and scroll to the first unread message on first open.
  const unreadCount = await GroupMessage.countDocuments({
    groupId,
    senderId: { $ne: session.user.id },
    "readBy.userId": { $ne: session.user.id },
  });

  // Mark every message not already read by this viewer as read by them (aggregate "Seen by N" receipts).
  await GroupMessage.updateMany(
    { groupId, senderId: { $ne: session.user.id }, "readBy.userId": { $ne: session.user.id } },
    { $push: { readBy: { userId: session.user.id, readAt: new Date() } } }
  );

  const messages = await GroupMessage.find({ groupId })
    .sort({ createdAt: 1 })
    .populate("senderId", "name avatarUrl")
    .populate("readBy.userId", "name avatarUrl")
    .populate("mentions", "name");
  const typingUsers = await getTypingUsers("group", groupId, session.user.id);
  return NextResponse.json({ messages, typingUsers, unreadCount });
}

export async function POST(req: Request, { params }: { params: Promise<{ groupId: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { groupId } = await params;
  const { text, mentions, replyToId, attachments } = await req.json();
  const hasAttachment = Array.isArray(attachments) && attachments.length > 0;
  if (!text?.trim() && !hasAttachment) return NextResponse.json({ error: "text is required" }, { status: 400 });

  await connectDB();
  const activeGroup = await Group.findOne({ _id: groupId, deletedAt: null });
  if (!activeGroup) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await isGroupMember(groupId, session.user.id, activeGroup.orgId?.toString() ?? null))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Only actual group members can be mentioned, and never yourself.
  const mentionIds: string[] = Array.isArray(mentions) ? [...new Set(mentions)].filter((id) => id !== session.user.id) : [];
  let validMentions: string[] = [];
  if (mentionIds.length > 0) {
    const validMembers = await GroupMember.find({ groupId, userId: { $in: mentionIds } }, "userId");
    validMentions = validMembers.map((m) => m.userId.toString());
  }

  // Snapshot the quoted message at write time — a reply shouldn't break if the original is later deleted.
  let replyTo = null;
  if (replyToId) {
    const target = await GroupMessage.findOne({ _id: replyToId, groupId }).populate("senderId", "name");
    if (target) {
      replyTo = { messageId: target._id, text: target.text || "📎 Attachment", senderName: (target.senderId as unknown as { name: string }).name };
    }
  }

  const message = await GroupMessage.create({
    groupId,
    senderId: session.user.id,
    text: text?.trim() ?? "",
    mentions: validMentions,
    replyTo,
    attachments: hasAttachment ? attachments : [],
  });
  await message.populate("senderId", "name avatarUrl");
  await message.populate("mentions", "name");

  const group = await Group.findById(groupId);

  if (validMentions.length > 0) {
    await notifyMany(
      validMentions,
      "mention",
      `${session.user.name} mentioned you in ${group?.name ?? "a group"}`,
      { description: text?.trim() || "🎤 Voice note", payload: { groupId, messageId: message._id } }
    );
  }

  // Notify all other group members about the new message (excluding already-mentioned members and the sender).
  const allMembers = await GroupMember.find({ groupId }, "userId").lean();
  const mentionSet = new Set(validMentions);
  const broadcastIds = allMembers
    .map((m: { userId: { toString(): string } }) => m.userId.toString())
    .filter((id: string) => id !== session.user.id && !mentionSet.has(id));

  if (broadcastIds.length > 0) {
    const preview = text?.trim()
      ? text.trim().length > 60 ? text.trim().slice(0, 60) + "…" : text.trim()
      : "📎 Attachment";
    await notifyMany(
      broadcastIds,
      "group_message",
      `${session.user.name} in ${group?.name ?? "a group"}: ${preview}`,
      { description: preview, payload: { groupId, messageId: message._id } }
    );
  }

  return NextResponse.json({ message }, { status: 201 });
}
