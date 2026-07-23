import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { connectDB } from "@/lib/db";
import Group from "@/models/Group";
import Project from "@/models/Project";
import Task from "@/models/Task";
import { isGroupAdmin } from "@/lib/permissions";

export async function PATCH(req: Request, { params }: { params: Promise<{ taskId: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { taskId } = await params;
  const { index, done } = await req.json();

  await connectDB();
  const task = await Task.findOne({ _id: taskId, deletedAt: null });
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!task.subtasks[index]) return NextResponse.json({ error: "Invalid subtask index" }, { status: 400 });

  const project = await Project.findById(task.projectId);
  const group = project ? await Group.findById(project.groupId) : null;
  const isAssignee = task.assignedTo?.toString() === session.user.id;
  const admin = project
    ? await isGroupAdmin(project.groupId.toString(), session.user.id, group?.orgId?.toString() ?? null)
    : false;

  if (!isAssignee && !admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  task.subtasks[index].done = !!done;
  await task.save();

  return NextResponse.json({ task });
}
