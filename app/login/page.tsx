"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await signIn("credentials", { email, password, redirect: false });
    setLoading(false);
    if (res?.error) {
      setError("Invalid email or password");
      return;
    }
    router.push("/dashboard");
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20 }}>
      <Link href="/" className="back-link" style={{ position: "absolute", top: 20, left: 20 }}>
        ← Back to home
      </Link>
      <div className="card elev-sm" style={{ width: "min(360px, 90vw)" }}>
        <div className="card-title">Log in to TaskFlow</div>
        <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="field">
            <label>Email</label>
            <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="field">
            <label>Password</label>
            <input className="input" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          {error && <div style={{ color: "oklch(70% 0.15 25)", fontSize: 12.5 }}>{error}</div>}
          <button className="btn btn-primary btn-block" disabled={loading} type="submit">
            {loading ? "Logging in…" : "Log in"}
          </button>
        </form>
        <button className="btn btn-secondary btn-block" onClick={() => signIn("google", { callbackUrl: "/dashboard" })}>
          Continue with Google
        </button>
        <div className="card-meta">
          No account? <Link href="/signup" style={{ color: "var(--color-accent-300)" }}>Sign up</Link>
        </div>
      </div>
    </div>
  );
}
