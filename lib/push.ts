import webpush from "web-push";
import PushSubscription from "@/models/PushSubscription";

const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const privateKey = process.env.VAPID_PRIVATE_KEY;
if (publicKey && privateKey) {
  webpush.setVapidDetails("mailto:support@taskflow.app", publicKey, privateKey);
}

/** Best-effort — a dead subscription (endpoint expired/unsubscribed) is pruned, everything else is swallowed so a push failure never breaks the action that triggered it. */
export async function sendPush(userId: string, title: string, body: string, url?: string) {
  if (!publicKey || !privateKey) return;

  const subs = await PushSubscription.find({ userId });
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: sub.keys },
          JSON.stringify({ title, body, url }),
          {
            TTL: 86400, // 24h Time-To-Live required for mobile APNs delivery when locked/sleeping
            urgency: "high", // High urgency for immediate mobile wake-up
          }
        );
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await PushSubscription.deleteOne({ _id: sub._id });
        }
      }
    })
  );
}
