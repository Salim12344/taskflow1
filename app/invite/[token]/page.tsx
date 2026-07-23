"use client";

import { useEffect, useState, use as usePromise } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api-client";

type InviteInfo = { group: { id: string; name: string }; loggedIn: boolean; alreadyMember: boolean };

export default function InviteRedeemPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = usePromise(params);
  const router = useRouter();
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    api<InviteInfo>(`/api/invite/${token}`).then(setInfo).catch((e) => setError(e.message));
  }, [token]);

  async function join() {
    setJoining(true);
    try {
      const res = await api<{ group: { id: string } }>(`/api/invite/${token}`, { method: "POST" });
      router.push(`/groups/${res.group.id}`);
    } catch (e) {
      setError((e as Error).message);
      setJoining(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div className="card elev-sm" style={{ width: 400 }}>
        {error && <div style={{ color: "oklch(70% 0.15 25)", fontSize: 13.5 }}>{error}</div>}
        {!error && !info && <div className="card-meta">Checking invite…</div>}
        {info && (
          <>
            <div className="card-title">You&rsquo;ve been invited to join {info.group.name}</div>
            {info.alreadyMember ? (
              <>
                <div className="card-body">You&rsquo;re already a member.</div>
                <button className="btn btn-primary btn-block" onClick={() => router.push(`/groups/${info.group.id}`)}>Go to group</button>
              </>
            ) : info.loggedIn ? (
              <button className="btn btn-primary btn-block" disabled={joining} onClick={join}>
                {joining ? "Joining…" : "Join group"}
              </button>
            ) : (
              <div style={{ display: "flex", gap: 8 }}>
                <Link className="btn btn-primary" style={{ flex: 1, textAlign: "center" }} href={`/signup?invite=${token}`}>Sign up</Link>
                <Link className="btn btn-secondary" style={{ flex: 1, textAlign: "center" }} href={`/login?invite=${token}`}>Log in</Link>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
