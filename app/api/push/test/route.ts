import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { sendPush } from "@/lib/push";

export async function POST() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await sendPush(
    session.user.id,
    "TaskFlow Push Test",
    "Push notifications are working on your mobile device!",
    "/settings"
  );

  return NextResponse.json({ ok: true });
}
