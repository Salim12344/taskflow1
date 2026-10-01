import { NextResponse } from "next/server";
import crypto from "crypto";
import { auth } from "@/auth";
import { connectDB } from "@/lib/db";
import Group from "@/models/Group";
import InviteLink from "@/models/InviteLink";
import User from "@/models/User";
import GroupMember from "@/models/GroupMember";
import { isGroupAdmin } from "@/lib/permissions";
import { sendEmail } from "@/lib/email";
import { groupInviteEmail } from "@/lib/email-templates";

export async function GET(_req: Request, { params }: { params: Promise<{ groupId: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { groupId } = await params;
  await connectDB();
  const group = await Group.findOne({ _id: groupId, deletedAt: null });
  if (!group) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await isGroupAdmin(groupId, session.user.id, group.orgId?.toString() ?? null))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const invites = await InviteLink.find({ groupId, status: "pending" });
  return NextResponse.json({ invites });
}

export async function POST(req: Request, { params }: { params: Promise<{ groupId: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { groupId } = await params;
  const body = await req.json();
  const type = body.type as "email" | "link";
  const expiresInDays = Number(body.expiresInDays ?? 7);

  await connectDB();
  const group = await Group.findOne({ _id: groupId, deletedAt: null });
  if (!group) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await isGroupAdmin(groupId, session.user.id, group.orgId?.toString() ?? null))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (type !== "email" && type !== "link") {
    return NextResponse.json({ error: "type must be 'email' or 'link'" }, { status: 400 });
  }
  if (type === "email") {
    if (!body.email) {
      return NextResponse.json({ error: "email is required for email invites" }, { status: 400 });
    }
    const targetEmail = String(body.email).toLowerCase().trim();
    const targetUser = await User.findOne({ email: targetEmail });
    if (!targetUser) {
      return NextResponse.json({ error: "No user account found with this email on TaskFlow" }, { status: 400 });
    }
    if (targetUser.signupStatus !== "approved") {
      return NextResponse.json({ error: "This user's account signup has not been approved yet" }, { status: 400 });
    }
    if (group.orgId && (!targetUser.orgId || targetUser.orgId.toString() !== group.orgId.toString())) {
      return NextResponse.json({ error: "This user does not belong to your organization" }, { status: 400 });
    }
    const isAlreadyMember = await GroupMember.findOne({ groupId, userId: targetUser._id });
    if (isAlreadyMember) {
      return NextResponse.json({ error: "This user is already a member of this group" }, { status: 400 });
    }
  }

  const token = crypto.randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);

  const invite = await InviteLink.create({
    groupId,
    type,
    email: type === "email" ? body.email.toLowerCase() : null,
    token,
    createdBy: session.user.id,
    expiresAt,
    maxUses: type === "link" ? (body.maxUses ?? null) : 1,
    useCount: 0,
    status: "pending",
  });

  if (type === "email") {
    await sendEmail(
      body.email,
      `You've been invited to join ${group.name} on TaskFlow`,
      groupInviteEmail(session.user.name ?? "Someone", group.name, token)
    );
  }

  return NextResponse.json({ invite }, { status: 201 });
}
