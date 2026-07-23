"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accountType, setAccountType] = useState<"individual" | "organization">("individual");
  const [orgName, setOrgName] = useState("");
  const [regNumber, setRegNumber] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await fetch("/api/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        email,
        password,
        accountType,
        orgName: accountType === "organization" ? orgName : undefined,
        regNumber: accountType === "organization" ? regNumber : undefined,
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Something went wrong");
      setLoading(false);
      return;
    }
    const signInRes = await signIn("credentials", { email, password, redirect: false });
    setLoading(false);
    if (signInRes?.error) {
      router.push("/login");
      return;
    }
    router.push("/dashboard");
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20 }}>
      <Link href="/" className="back-link" style={{ position: "absolute", top: 20, left: 20 }}>
        ← Back to home
      </Link>
      <div className="card elev-sm" style={{ width: "min(380px, 90vw)" }}>
        <div className="card-title">Create your TaskFlow account</div>
        <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="field">
            <label>Name</label>
            <input className="input" required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field">
            <label>Email</label>
            <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="field">
            <label>Password</label>
            <input className="input" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <div className="field">
            <label>Account type</label>
            <select className="input" value={accountType} onChange={(e) => setAccountType(e.target.value as "individual" | "organization")}>
              <option value="individual">Individual</option>
              <option value="organization">Organization</option>
            </select>
          </div>
          {accountType === "organization" && (
            <>
              <div className="field">
                <label>Organization name</label>
                <input className="input" required value={orgName} onChange={(e) => setOrgName(e.target.value)} />
              </div>
              <div className="field">
                <label>Business / corporate registration number</label>
                <input
                  className="input"
                  required
                  inputMode="numeric"
                  pattern="\d{6}"
                  maxLength={6}
                  placeholder="6-digit number, e.g. 482913"
                  value={regNumber}
                  onChange={(e) => setRegNumber(e.target.value.replace(/\D/g, "").slice(0, 6))}
                />
              </div>
            </>
          )}
          {error && <div style={{ color: "oklch(70% 0.15 25)", fontSize: 12.5 }}>{error}</div>}
          <button className="btn btn-primary btn-block" disabled={loading} type="submit">
            {loading ? "Creating account…" : "Sign up"}
          </button>
        </form>
        <div className="card-meta">
          Already have an account? <Link href="/login" style={{ color: "var(--color-accent-300)" }}>Log in</Link>
        </div>
      </div>
    </div>
  );
}
