import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { connectDB } from "@/lib/db";
import InviteLink from "@/models/InviteLink";
import Group from "@/models/Group";
import GroupMember from "@/models/GroupMember";
import GroupMessage from "@/models/GroupMessage";
import Notification from "@/models/Notification";

async function validateInvite(token: string) {
  const invite = await InviteLink.findOne({ token });
  if (!invite) return { error: "This invite link is invalid.", status: 404 } as const;
  if (invite.expiresAt < new Date() || invite.status === "expired") {
    return { error: "This invite link has expired, ask the admin to send a new one.", status: 410 } as const;
  }
  if (invite.maxUses != null && invite.useCount >= invite.maxUses) {
    return { error: "This invite link has expired, ask the admin to send a new one.", status: 410 } as const;
  }
  const group = await Group.findOne({ _id: invite.groupId, deletedAt: null });
  if (!group) return { error: "This group no longer exists.", status: 404 } as const;
  return { invite, group } as const;
}

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  await connectDB();
  const result = await validateInvite(token);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });

  const session = await auth();
  let alreadyMember = false;
  if (session?.user) {
    alreadyMember = !!(await GroupMember.findOne({ groupId: result.group._id, userId: session.user.id }));
  }

  return NextResponse.json({
    group: { id: result.group._id, name: result.group.name },
    loggedIn: !!session?.user,
    alreadyMember,
  });
}

export async function POST(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { token } = await params;
  await connectDB();
  const result = await validateInvite(token);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  const { invite, group } = result;

  const existingMembership = await GroupMember.findOne({ groupId: group._id, userId: session.user.id });
  if (existingMembership) {
    return NextResponse.json({ alreadyMember: true, group: { id: group._id, name: group.name } });
  }

  await GroupMember.create({ groupId: group._id, userId: session.user.id, role: "member" });
  invite.useCount += 1;
  if (invite.type === "email") invite.status = "accepted";
  await invite.save();

  await GroupMessage.create({
    groupId: group._id,
    senderId: session.user.id,
    text: `${session.user.name} joined the group`,
    isSystemMessage: true,
  });

  const admins = await GroupMember.find({ groupId: group._id, role: "admin" });
  await Notification.insertMany(
    admins.map((a) => ({
      userId: a.userId,
      type: "member_joined",
      payload: { groupId: group._id, userId: session.user.id },
    }))
  );

  return NextResponse.json({ alreadyMember: false, group: { id: group._id, name: group.name } });
}
