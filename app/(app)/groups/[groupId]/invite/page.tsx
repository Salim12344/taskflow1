"use client";

import { useState, use as usePromise } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { api } from "@/lib/api-client";
import { onKeyActivate } from "@/lib/a11y";
import { ErrorBanner } from "@/components/ErrorBanner";

type Invite = { token: string; type: "email" | "link"; email: string | null };

export default function InvitePage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = usePromise(params);
  const router = useRouter();
  const { data: session } = useSession();
  const [email, setEmail] = useState("");
  const [linkInvite, setLinkInvite] = useState<Invite | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [sent, setSent] = useState(false);

  async function sendEmailInvite(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const targetEmail = email.trim().toLowerCase();
    if (session?.user?.email && targetEmail === session.user.email.toLowerCase().trim()) {
      setError(new Error("You cannot invite yourself to a group"));
      return;
    }
    try {
      await api(`/api/groups/${groupId}/invites`, { method: "POST", body: JSON.stringify({ type: "email", email: targetEmail }) });
      setSent(true);
      setEmail("");
      setTimeout(() => setSent(false), 5000);
    } catch (e) {
      setError(e);
    }
  }

  async function createLinkInvite() {
    setError(null);
    try {
      const { invite } = await api<{ invite: Invite }>(`/api/groups/${groupId}/invites`, { method: "POST", body: JSON.stringify({ type: "link" }) });
      setLinkInvite(invite);
    } catch (e) {
      setError(e);
    }
  }

  const origin = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <div className="tf-fade page-pad" style={{ padding: "24px 40px 40px", minHeight: "100%", display: "flex", flexDirection: "column" }}>
      <div role="link" tabIndex={0} onClick={() => router.push(`/groups/${groupId}`)} onKeyDown={onKeyActivate(() => router.push(`/groups/${groupId}`))} className="back-link" style={{ marginBottom: 20 }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        Back to group
      </div>

      <ErrorBanner error={error} />

      <div style={{ flex: 1, display: "flex", justifyContent: "center" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 20, width: "100%", maxWidth: 820, height: "fit-content" }}>
          <form onSubmit={sendEmailInvite} className="card elev-sm">
            <div className="card-title">Invite by email</div>
            <div className="card-body">Send a direct invite to someone&rsquo;s email address.</div>
            <div style={{ display: "flex", gap: 8 }}>
              <input className="input" type="email" required placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
              <button className="btn btn-primary" type="submit">Send</button>
            </div>
            {sent && <div style={{ fontSize: 12.5, color: "var(--color-accent-300)" }}>Invite sent.</div>}
          </form>

          <div className="card elev-sm">
            <div className="card-title">Invite via link</div>
            <div className="card-body">Anyone with this link can join as a member.</div>
            {linkInvite ? (
              <div style={{ display: "flex", gap: 8 }}>
                <input className="input" readOnly value={`${origin}/invite/${linkInvite.token}`} />
                <button className="btn btn-primary" onClick={() => navigator.clipboard.writeText(`${origin}/invite/${linkInvite.token}`)}>Copy</button>
              </div>
            ) : (
              <button className="btn btn-primary btn-block" onClick={createLinkInvite}>Generate link</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
