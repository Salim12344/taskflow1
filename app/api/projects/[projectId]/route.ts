import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { connectDB } from "@/lib/db";
import Group from "@/models/Group";
import Project from "@/models/Project";
import { isGroupAdmin, isGroupMember } from "@/lib/permissions";

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

  return NextResponse.json({ project });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId } = await params;
  const updates = await req.json();

  await connectDB();
  const project = await Project.findById(projectId);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const group = await Group.findById(project.groupId);
  if (!(await isGroupAdmin(project.groupId.toString(), session.user.id, group?.orgId?.toString() ?? null))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const allowed = ["name", "description", "deadline", "status"] as const;
  for (const key of allowed) {
    if (key in updates) (project as Record<string, unknown>)[key] = updates[key];
  }
  await project.save();

  return NextResponse.json({ project });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId } = await params;
  await connectDB();
  const project = await Project.findById(projectId);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const group = await Group.findById(project.groupId);
  if (!(await isGroupAdmin(project.groupId.toString(), session.user.id, group?.orgId?.toString() ?? null))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await Project.deleteOne({ _id: projectId });
  return NextResponse.json({ ok: true });
}
