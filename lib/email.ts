import { Resend } from "resend";

/**
 * Send a transactional email via Resend.
 * @param to      Recipient address, e.g. "jane@example.com"
 * @param subject Email subject line
 * @param html    Full HTML body — use the helpers in lib/email-templates.ts
 */
export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[email] RESEND_API_KEY is not configured. Skipping email to:", to);
    return;
  }

  const resend = new Resend(apiKey);
  const from = process.env.RESEND_FROM ?? "TaskFlow <onboarding@resend.dev>";
  const { error } = await resend.emails.send({ from, to, subject, html });
  if (error) {
    console.error("[email] Resend error:", error);
    throw new Error(error.message);
  }
}
