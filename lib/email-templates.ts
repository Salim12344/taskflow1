const BASE_URL = process.env.NEXTAUTH_URL ?? "https://taskflow1-fawn-delta.vercel.app";

/** Shared wrapper — dark-themed, branded, mobile-responsive */
function wrap(content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>TaskFlow</title>
</head>
<body style="margin:0;padding:0;background:#0f0e13;font-family:'Segoe UI',Arial,sans-serif;color:#e4e0f0;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f0e13;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" style="max-width:520px;background:#1a1825;border-radius:16px;overflow:hidden;border:1px solid #2d2a3e;">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#6d28d9,#4f46e5);padding:28px 32px;">
              <span style="font-size:22px;font-weight:700;color:#fff;letter-spacing:-0.5px;">✦ TaskFlow</span>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              ${content}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px;border-top:1px solid #2d2a3e;">
              <p style="margin:0;font-size:12px;color:#6b6882;text-align:center;">
                You're receiving this email because of activity on your TaskFlow account.<br/>
                <a href="${BASE_URL}" style="color:#8b5cf6;text-decoration:none;">Visit TaskFlow</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** CTA button */
function btn(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;margin-top:24px;padding:13px 28px;background:linear-gradient(135deg,#6d28d9,#4f46e5);color:#fff;text-decoration:none;border-radius:10px;font-weight:600;font-size:15px;letter-spacing:0.1px;">${label}</a>`;
}

/** H1 heading */
function h1(text: string): string {
  return `<h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#f0eeff;">${text}</h1>`;
}

/** Body paragraph */
function p(text: string): string {
  return `<p style="margin:8px 0;font-size:15px;line-height:1.6;color:#c4bedd;">${text}</p>`;
}

// ─── Templates ────────────────────────────────────────────────────────────────

/**
 * Group invite email.
 * @param inviterName  Name of the person sending the invite
 * @param groupName    Name of the group
 * @param token        Invite token (appended to /invite/ route)
 */
export function groupInviteEmail(inviterName: string, groupName: string, token: string): string {
  const link = `${BASE_URL}/invite/${token}`;
  return wrap(`
    ${h1(`You've been invited to join ${groupName}`)}
    ${p(`<strong style="color:#e4e0f0;">${inviterName}</strong> has invited you to join the <strong style="color:#e4e0f0;">${groupName}</strong> group on TaskFlow.`)}
    ${p("Click the button below to accept the invitation. The link expires in 7 days.")}
    <div style="text-align:center;">${btn(link, "Accept Invitation")}</div>
    <p style="margin-top:20px;font-size:12px;color:#6b6882;word-break:break-all;">Or copy this link: <a href="${link}" style="color:#8b5cf6;">${link}</a></p>
  `);
}

/**
 * Signup approved email.
 * @param userName  Name of the applicant
 * @param orgName   Name of the organisation they joined
 */
export function signupApprovedEmail(userName: string, orgName: string): string {
  const link = `${BASE_URL}/dashboard`;
  return wrap(`
    ${h1("Your account has been approved 🎉")}
    ${p(`Hi <strong style="color:#e4e0f0;">${userName}</strong>,`)}
    ${p(`Great news — your request to join <strong style="color:#e4e0f0;">${orgName}</strong> on TaskFlow has been approved. You can now log in and get started.`)}
    <div style="text-align:center;">${btn(link, "Go to Dashboard")}</div>
  `);
}

/**
 * Signup rejected email.
 * @param userName  Name of the applicant
 * @param orgName   Name of the organisation
 */
export function signupRejectedEmail(userName: string, orgName: string): string {
  return wrap(`
    ${h1("Your account request was not approved")}
    ${p(`Hi <strong style="color:#e4e0f0;">${userName}</strong>,`)}
    ${p(`Unfortunately, your request to join <strong style="color:#e4e0f0;">${orgName}</strong> on TaskFlow was not approved at this time.`)}
    ${p("If you think this is a mistake, please reach out to your organisation administrator.")}
  `);
}
