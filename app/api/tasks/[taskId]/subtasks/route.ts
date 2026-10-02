import { NextResponse } from "next/server";

export async function PATCH() {
  return NextResponse.json({ error: "Subtasks are no longer supported" }, { status: 404 });
}
