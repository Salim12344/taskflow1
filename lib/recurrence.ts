export function nextDueDate(deadline: Date | null, recurrence: "daily" | "weekly" | "monthly") {
  const base = deadline ?? new Date();
  const next = new Date(base);
  if (recurrence === "daily") next.setDate(next.getDate() + 1);
  if (recurrence === "weekly") next.setDate(next.getDate() + 7);
  if (recurrence === "monthly") next.setMonth(next.getMonth() + 1);
  return next;
}
