import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { connectDB } from "@/lib/db";
import Group from "@/models/Group";
import GroupMember from "@/models/GroupMember";
import Project from "@/models/Project";
import Task from "@/models/Task";
import { countAdmins, countPendingReviewTasks } from "@/lib/permissions";

export async function POST(_req: Request, { params }: { params: Promise<{ groupId: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { groupId } = await params;
  await connectDB();
  const group = await Group.findOne({ _id: groupId, deletedAt: null });
  if (!group) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const membership = await GroupMember.findOne({ groupId, userId: session.user.id });
  if (!membership) return NextResponse.json({ error: "Not a member" }, { status: 404 });

  if (membership.role === "admin" && (await countAdmins(groupId)) <= 1) {
    return NextResponse.json(
      { error: "Promote another member to admin before leaving/stepping down" },
      { status: 409 }
    );
  }

  const projects = await Project.find({ groupId }, "_id");
  const projectIds = projects.map((p) => p._id);

  if (membership.role === "admin") {
    const pending = await countPendingReviewTasks(projectIds.map(String));
    if (pending > 0) {
      return NextResponse.json(
        {
          error: `There are ${pending} tasks pending review in this group. Review or reassign them before you can leave or step down.`,
        },
        { status: 409 }
      );
    }
  }

  const assignedCount = await Task.countDocuments({
    projectId: { $in: projectIds },
    assignedTo: session.user.id,
    deletedAt: null,
    status: { $ne: "done" },
  });
  if (assignedCount > 0) {
    return NextResponse.json(
      {
        error: `You have ${assignedCount} tasks assigned in this group. Ask an admin to reassign them before you can leave, or move them to Done first.`,
      },
      { status: 409 }
    );
  }

  await GroupMember.deleteOne({ groupId, userId: session.user.id });

  return NextResponse.json({ ok: true });
}
