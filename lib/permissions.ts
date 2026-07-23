import { connectDB } from "@/lib/db";
import GroupMember from "@/models/GroupMember";
import Task from "@/models/Task";
import Organization from "@/models/Organization";

/** Admin either via groupMembers role, or as the owner of the group's org. */
export async function isGroupAdmin(groupId: string, userId: string, orgId: string | null) {
  await connectDB();
  if (orgId) {
    const org = await Organization.findById(orgId);
    if (org && org.ownerId.toString() === userId) return true;
  }
  const member = await GroupMember.findOne({ groupId, userId });
  return member?.role === "admin";
}

export async function isGroupMember(groupId: string, userId: string) {
  await connectDB();
  const member = await GroupMember.findOne({ groupId, userId });
  return !!member;
}

/** Tasks can only be assigned to regular members — admins (including the group's own admins) are never assignable. */
export async function isAssignableMember(groupId: string, userId: string) {
  await connectDB();
  const member = await GroupMember.findOne({ groupId, userId });
  return member?.role === "member";
}

export async function countAdmins(groupId: string) {
  await connectDB();
  return GroupMember.countDocuments({ groupId, role: "admin" });
}

export async function countAssignedTasks(groupId: string, userId: string, projectIds: string[]) {
  await connectDB();
  return Task.countDocuments({
    projectId: { $in: projectIds },
    assignedTo: userId,
    deletedAt: null,
    status: { $ne: "done" },
  });
}

export async function countPendingReviewTasks(projectIds: string[]) {
  await connectDB();
  return Task.countDocuments({
    projectId: { $in: projectIds },
    status: "pending_review",
    deletedAt: null,
  });
}
