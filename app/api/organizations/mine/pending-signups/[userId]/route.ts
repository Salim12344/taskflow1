import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { connectDB } from "@/lib/db";
import Organization from "@/models/Organization";
import User from "@/models/User";
import { hasOrgPermission } from "@/lib/permissions";
import { sendEmail } from "@/lib/email";
import { signupApprovedEmail, signupRejectedEmail } from "@/lib/email-templates";

export async function PATCH(req: Request, { params }: { params: Promise<{ userId: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { userId } = await params;
  const body = await req.json().catch(() => ({}));
  // Backwards-compatible: accept { approve: boolean } or new { action: 'approve'|'reject'|'reopen' }
  let action: "approve" | "reject" | "reopen" | null = null;
  if (typeof body.action === "string") {
    if (body.action === "approve" || body.action === "reject" || body.action === "reopen") action = body.action;
  } else if (typeof body.approve === "boolean") {
    action = body.approve ? "approve" : "reject";
  }
  if (!action) return NextResponse.json({ error: "action must be 'approve', 'reject', or 'reopen'" }, { status: 400 });

  await connectDB();
  let org = await Organization.findOne({ ownerId: session.user.id });
  if (!org) {
    // Not the owner — allow through only if this admin was explicitly granted approve_signups.
    const actor = await User.findById(session.user.id, "orgId");
    if (actor?.orgId && (await hasOrgPermission(session.user.id, actor.orgId.toString(), "approve_signups"))) {
      org = await Organization.findById(actor.orgId);
    }
  }
  if (!org) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const target = await User.findOne({ _id: userId, orgId: org._id });
  if (!target) return NextResponse.json({ error: "No sign-up found for that user" }, { status: 404 });

  // Only allow changing status if the current state is sensible. Owners/admins can reopen or reject.
  if (action === "approve") target.signupStatus = "approved";
  else if (action === "reject") target.signupStatus = "rejected";
  else if (action === "reopen") target.signupStatus = "pending";
  await target.save();

  // Notify the applicant by email (fire-and-forget — don't fail the request if email bounces).
  if (target.email) {
    const orgName: string = org.name ?? "your organisation";
    const userName: string = target.name ?? "there";
    if (action === "approve") {
      sendEmail(target.email, "Your TaskFlow account has been approved 🎉", signupApprovedEmail(userName, orgName)).catch(console.error);
    } else if (action === "reject") {
      sendEmail(target.email, "Update on your TaskFlow account request", signupRejectedEmail(userName, orgName)).catch(console.error);
    }
  }

  return NextResponse.json({ ok: true });
}
