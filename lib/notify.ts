import Notification from "@/models/Notification";
import { sendPush } from "@/lib/push";

function pushUrlFor(payload?: Record<string, unknown>) {
  if (payload?.threadId) return `/messages/${payload.threadId}`;
  if (payload?.taskId) return `/tasks/${payload.taskId}`;
  if (payload?.groupId) return `/groups/${payload.groupId}`;
  return "/notifications";
}

export async function notify(
  userId: string,
  type: string,
  text: string,
  opts?: { description?: string; payload?: Record<string, unknown> }
) {
  const notification = await Notification.create({
    userId,
    type,
    text,
    description: opts?.description ?? null,
    payload: opts?.payload ?? {},
  });
  // Must be awaited, not fired-and-forgotten — on serverless, the function can freeze the
  // instant the route's response is sent, killing any still-in-flight unawaited promise.
  await sendPush(userId, "TaskFlow", text, pushUrlFor(opts?.payload)).catch(() => {});
  return notification;
}

export async function notifyMany(
  userIds: string[],
  type: string,
  text: string,
  opts?: { description?: string; payload?: Record<string, unknown> }
) {
  if (userIds.length === 0) return;
  await Notification.insertMany(
    userIds.map((userId) => ({
      userId,
      type,
      text,
      description: opts?.description ?? null,
      payload: opts?.payload ?? {},
    }))
  );
  const url = pushUrlFor(opts?.payload);
  await Promise.all(userIds.map((userId) => sendPush(userId, "TaskFlow", text, url).catch(() => {})));
}
