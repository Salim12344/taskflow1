import { NextResponse } from "next/server";
import type { Types } from "mongoose";
import { auth } from "@/auth";
import { connectDB } from "@/lib/db";
import DMThread from "@/models/DMThread";
import DMMessage from "@/models/DMMessage";
import { getTypingUsers } from "@/lib/typing";

async function requireParticipant(threadId: string, userId: string) {
  const thread = await DMThread.findById(threadId);
  if (!thread) return null;
  if (!thread.participantIds.some((p: Types.ObjectId) => p.toString() === userId)) return null;
  return thread;
}

export async function GET(_req: Request, { params }: { params: Promise<{ threadId: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { threadId } = await params;
  await connectDB();
  const thread = await requireParticipant(threadId, session.user.id);
  if (!thread) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const messages = await DMMessage.find({ threadId }).sort({ createdAt: 1 });

  // Count messages this viewer hasn't read yet — before we mark them.
  const unreadCount = await DMMessage.countDocuments({
    threadId,
    senderId: { $ne: session.user.id },
    readAt: null,
  });

  await DMMessage.updateMany(
    { threadId, senderId: { $ne: session.user.id }, readAt: null },
    { $set: { readAt: new Date() } }
  );

  const typingUsers = await getTypingUsers("dm", threadId, session.user.id);
  return NextResponse.json({ messages, otherTyping: typingUsers.length > 0, unreadCount });
}

export async function POST(req: Request, { params }: { params: Promise<{ threadId: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { threadId } = await params;
  const { text, replyToId, attachments } = await req.json();
  const hasAttachment = Array.isArray(attachments) && attachments.length > 0;
  if (!text?.trim() && !hasAttachment) return NextResponse.json({ error: "text is required" }, { status: 400 });

  await connectDB();
  const thread = await requireParticipant(threadId, session.user.id);
  if (!thread) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Snapshot the quoted message at write time — a reply shouldn't break if the original is later deleted.
  let replyTo = null;
  if (replyToId) {
    const target = await DMMessage.findOne({ _id: replyToId, threadId }).populate("senderId", "name");
    if (target) {
      replyTo = { messageId: target._id, text: target.text || "📎 Attachment", senderName: (target.senderId as unknown as { name: string }).name };
    }
  }

  const message = await DMMessage.create({
    threadId,
    senderId: session.user.id,
    text: text?.trim() ?? "",
    replyTo,
    attachments: hasAttachment ? attachments : [],
  });
  thread.lastMessageAt = new Date();
  await thread.save();

  return NextResponse.json({ message }, { status: 201 });
}
