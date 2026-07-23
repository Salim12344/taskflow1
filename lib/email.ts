// ponytail: stub — real Resend send-out belongs to Phase 3 (Notifications). Logs instead of sending for now.
export async function sendEmail(to: string, subject: string, body: string) {
  console.log(`[email stub] to=${to} subject="${subject}"\n${body}`);
}
