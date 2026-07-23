"use client";

import { useState, use as usePromise } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";

type Invite = { token: string; type: "email" | "link"; email: string | null };

export default function InvitePage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = usePromise(params);
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [linkInvite, setLinkInvite] = useState<Invite | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function sendEmailInvite(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api(`/api/groups/${groupId}/invites`, { method: "POST", body: JSON.stringify({ type: "email", email }) });
      setSent(true);
      setEmail("");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function createLinkInvite() {
    setError(null);
    try {
      const { invite } = await api<{ invite: Invite }>(`/api/groups/${groupId}/invites`, { method: "POST", body: JSON.stringify({ type: "link" }) });
      setLinkInvite(invite);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const origin = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <div className="tf-fade page-pad" style={{ padding: "24px 40px 40px", minHeight: "100%", display: "flex", flexDirection: "column" }}>
      <div onClick={() => router.push(`/groups/${groupId}`)} className="back-link" style={{ marginBottom: 20, width: "fit-content" }}>
        ← Back to group
      </div>

      {error && <div style={{ color: "oklch(70% 0.15 25)", fontSize: 13, marginBottom: 16 }}>{error}</div>}

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
