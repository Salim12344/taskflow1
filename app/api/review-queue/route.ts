import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { connectDB } from "@/lib/db";
import Group from "@/models/Group";
import GroupMember from "@/models/GroupMember";
import Organization from "@/models/Organization";
import Project from "@/models/Project";
import Task from "@/models/Task";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();
  const userId = session.user.id;

  const adminMemberships = await GroupMember.find({ userId, role: "admin" });
  const adminGroupIds = new Set(adminMemberships.map((m) => m.groupId.toString()));

  // Org owners are admins on every group under their org, even ones they weren't added to directly.
  const ownedOrgs = await Organization.find({ ownerId: userId });
  if (ownedOrgs.length) {
    const orgGroups = await Group.find({ orgId: { $in: ownedOrgs.map((o) => o._id) }, deletedAt: null });
    orgGroups.forEach((g) => adminGroupIds.add(g._id.toString()));
  }

  const groups = await Group.find({ _id: { $in: [...adminGroupIds] }, deletedAt: null });

  const sections = [];
  for (const group of groups) {
    const projects = await Project.find({ groupId: group._id }, "_id name");
    const projectMap = new Map(projects.map((p) => [p._id.toString(), p.name]));
    const tasks = await Task.find({
      projectId: { $in: projects.map((p) => p._id) },
      status: "pending_review",
      deletedAt: null,
    }).sort({ submittedAt: 1 });

    if (tasks.length === 0) continue;

    sections.push({
      groupId: group._id,
      groupName: group.name,
      tasks: tasks.map((t) => ({
        taskId: t._id,
        title: t.title,
        projectName: projectMap.get(t.projectId.toString()),
        assignedTo: t.assignedTo,
        submittedAt: t.submittedAt,
      })),
    });
  }

  return NextResponse.json({ sections });
}
