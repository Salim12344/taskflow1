import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { connectDB } from "@/lib/db";
import Group from "@/models/Group";
import Project from "@/models/Project";
import Task from "@/models/Task";
import { isAssignableMember, isGroupAdmin, isGroupMember } from "@/lib/permissions";

export async function GET(_req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId } = await params;
  await connectDB();
  const project = await Project.findById(projectId);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await isGroupMember(project.groupId.toString(), session.user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const tasks = await Task.find({ projectId, deletedAt: null });
  return NextResponse.json({ tasks });
}

export async function POST(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId } = await params;
  const { title, description, assignedTo, deadline, recurrence, subtasks } = await req.json();
  if (!title) return NextResponse.json({ error: "title is required" }, { status: 400 });

  await connectDB();
  const project = await Project.findById(projectId);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const group = await Group.findById(project.groupId);
  if (!(await isGroupAdmin(project.groupId.toString(), session.user.id, group?.orgId?.toString() ?? null))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (assignedTo) {
    if (!(await isAssignableMember(project.groupId.toString(), assignedTo))) {
      return NextResponse.json({ error: "Tasks can only be assigned to a regular member, not an admin" }, { status: 400 });
    }
  }

  const task = await Task.create({
    projectId,
    title,
    description: description ?? "",
    assignedTo: assignedTo ?? null,
    createdBy: session.user.id,
    deadline: deadline ?? null,
    recurrence: recurrence ?? "none",
    subtasks: subtasks ?? [],
  });

  return NextResponse.json({ task }, { status: 201 });
}
