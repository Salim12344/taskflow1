import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { connectDB } from "@/lib/db";
import Group from "@/models/Group";
import GroupMember from "@/models/GroupMember";
import Project from "@/models/Project";
import { isGroupAdmin, isGroupMember } from "@/lib/permissions";

export async function GET(_req: Request, { params }: { params: Promise<{ groupId: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { groupId } = await params;
  await connectDB();
  const group = await Group.findOne({ _id: groupId, deletedAt: null });
  if (!group) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!(await isGroupMember(groupId, session.user.id, group.orgId?.toString() ?? null))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [projectCount, memberCount] = await Promise.all([
    Project.countDocuments({ groupId }),
    GroupMember.countDocuments({ groupId }),
  ]);
  const showOnboarding = !group.onboardingDismissed && !(projectCount >= 1 && memberCount > 1);

  return NextResponse.json({ group, showOnboarding });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ groupId: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { groupId } = await params;
  await connectDB();
  const group = await Group.findOne({ _id: groupId, deletedAt: null });
  if (!group) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const orgId = group.orgId?.toString() ?? null;
  const isOrgOwner = session.user.accountType === "organization";

  if (!isOrgOwner) {
    // Non-org-owner admins can only delete if the org owner has explicitly granted them canDeleteGroup.
    const member = await GroupMember.findOne({ groupId, userId: session.user.id });
    if (!member?.canDeleteGroup) {
      return NextResponse.json({ error: "Only the organisation owner or an admin with delete permission can delete this group" }, { status: 403 });
    }
  }

  // Sanity-check: still must be a member/admin of the group (org owner is implicit).
  if (!isOrgOwner && !(await isGroupAdmin(groupId, session.user.id, orgId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  group.deletedAt = new Date();
  await group.save();

  return NextResponse.json({ ok: true });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ groupId: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { groupId } = await params;
  const body = await req.json();

  await connectDB();
  const group = await Group.findOne({ _id: groupId, deletedAt: null });
  if (!group) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Only the "dismiss onboarding" mutation is supported here; any member can dismiss.
  if (body.dismissOnboarding && (await isGroupMember(groupId, session.user.id, group.orgId?.toString() ?? null))) {
    group.onboardingDismissed = true;
    await group.save();
  }

  return NextResponse.json({ group });
}
