"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Sidebar } from "@/components/Sidebar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { status } = useSession();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [status, router]);

  if (status !== "authenticated") {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-text)" }}>
        Loading…
      </div>
    );
  }

  return (
    <div style={{ display: "flex", height: "100vh", width: "100%", overflow: "hidden" }}>
      <div className={`app-sidebar ${mobileOpen ? "open" : ""}`}>
        <Sidebar open={mobileOpen} onNavigate={() => setMobileOpen(false)} />
      </div>
      {mobileOpen && <div className="app-backdrop" onClick={() => setMobileOpen(false)} />}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <div className="mobile-topbar">
          <button
            aria-label="Open menu"
            onClick={() => setMobileOpen(true)}
            style={{ background: "none", border: "none", color: "var(--color-text)", cursor: "pointer", padding: 4 }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 6h18M3 12h18M3 18h18" /></svg>
          </button>
          <div style={{ fontFamily: "var(--font-heading)", fontWeight: 600, fontSize: 15 }}>TaskFlow</div>
        </div>
        <main style={{ flex: 1, overflowY: "auto", minWidth: 0 }}>{children}</main>
      </div>
    </div>
  );
}
