import { NextResponse } from "next/server";
import crypto from "crypto";
import { auth } from "@/auth";
import { connectDB } from "@/lib/db";
import Group from "@/models/Group";
import InviteLink from "@/models/InviteLink";
import { isGroupAdmin } from "@/lib/permissions";
import { sendEmail } from "@/lib/email";

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
  if (type === "email" && !body.email) {
    return NextResponse.json({ error: "email is required for email invites" }, { status: 400 });
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
      `Join here: /invite/${token}`
    );
  }

  return NextResponse.json({ invite }, { status: 201 });
}
