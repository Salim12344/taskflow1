import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { connectDB } from "@/lib/db";
import Group from "@/models/Group";
import Project from "@/models/Project";
import { isGroupAdmin, isGroupMember } from "@/lib/permissions";

export async function GET(_req: Request, { params }: { params: Promise<{ groupId: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { groupId } = await params;
  await connectDB();
  if (!(await isGroupMember(groupId, session.user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const projects = await Project.find({ groupId });
  return NextResponse.json({ projects });
}

export async function POST(req: Request, { params }: { params: Promise<{ groupId: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { groupId } = await params;
  const { name, description, deadline } = await req.json();
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

  await connectDB();
  const group = await Group.findOne({ _id: groupId, deletedAt: null });
  if (!group) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await isGroupAdmin(groupId, session.user.id, group.orgId?.toString() ?? null))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const project = await Project.create({
    groupId,
    name,
    description: description ?? "",
    deadline: deadline ?? null,
    createdBy: session.user.id,
  });

  return NextResponse.json({ project }, { status: 201 });
}
