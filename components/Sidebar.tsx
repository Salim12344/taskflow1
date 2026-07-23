"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { groupIcon } from "@/lib/group-icon";

type Group = { _id: string; name: string };

function NavRow({ href, label, active, icon }: { href: string; label: string; active: boolean; icon?: React.ReactNode }) {
  return (
    <Link href={href} style={{ textDecoration: "none", color: "inherit" }}>
      <div
        className={active ? "" : "nav-row"}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 10px",
          borderRadius: 8,
          cursor: "pointer",
          fontSize: 13.5,
          color: active ? "var(--color-accent-300)" : "inherit",
          background: active ? "color-mix(in srgb, var(--color-accent) 14%, transparent)" : "transparent",
        }}
      >
        {icon}
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
      </div>
    </Link>
  );
}

export function Sidebar({ open, onNavigate }: { open: boolean; onNavigate: () => void }) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [groups, setGroups] = useState<Group[]>([]);

  function loadGroups() {
    api<{ groups: Group[] }>("/api/groups")
      .then((d) => setGroups(d.groups))
      .catch(() => setGroups([]));
  }

  useEffect(loadGroups, [pathname]);
  useEffect(onNavigate, [pathname]);

  useEffect(() => {
    window.addEventListener("taskflow:groups-changed", loadGroups);
    return () => window.removeEventListener("taskflow:groups-changed", loadGroups);
  }, []);

  const initials = (session?.user?.name ?? "?")
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <aside
      style={{
        width: 264,
        flex: "none",
        display: "flex",
        flexDirection: "column",
        background: "var(--color-surface)",
        borderRight: "1px solid var(--color-divider)",
        height: "100vh",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "18px 18px 14px" }}>
        <div style={{ width: 28, height: 28, borderRadius: 8, background: "var(--color-accent-700)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent-100)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12l5 5L20 6" /></svg>
        </div>
        <div style={{ fontFamily: "var(--font-heading)", fontWeight: 600, fontSize: 16 }}>TaskFlow</div>
      </div>

      {session?.user && (
        <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 10px", margin: "0 10px 12px", background: "var(--color-bg)", borderRadius: 8 }}>
          <div className="avatar" style={{ width: 26, height: 26, fontSize: 10 }}>{initials}</div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600 }}>{session.user.name}</div>
            <div style={{ fontSize: 11, color: "color-mix(in srgb, var(--color-text) 55%, transparent)" }}>
              {session.user.accountType === "organization" ? "Organization" : "Individual"}
            </div>
          </div>
        </div>
      )}

      <div style={{ padding: "2px 20px 6px", fontSize: 10, letterSpacing: ".08em", textTransform: "uppercase", color: "color-mix(in srgb, var(--color-text) 50%, transparent)" }}>
        Overview
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 2, padding: "0 10px" }}>
        <NavRow href="/dashboard" label="Dashboard" active={pathname === "/dashboard"} />
        <NavRow href="/review-queue" label="Review queue" active={pathname === "/review-queue"} />
      </div>

      <div style={{ padding: "16px 20px 6px", fontSize: 10, letterSpacing: ".08em", textTransform: "uppercase", color: "color-mix(in srgb, var(--color-text) 50%, transparent)" }}>
        Groups
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 2, padding: "0 10px", overflowY: "auto" }}>
        {groups.map((g) => {
          const icon = groupIcon(g.name);
          return (
            <NavRow
              key={g._id}
              href={`/groups/${g._id}`}
              label={g.name}
              active={pathname === `/groups/${g._id}`}
              icon={
                <span style={{ width: 20, height: 20, borderRadius: 6, background: icon.bg, color: icon.fg, fontSize: 10.5, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
                  {icon.letter}
                </span>
              }
            />
          );
        })}
        {groups.length === 0 && (
          <div style={{ fontSize: 11.5, padding: "4px 10px", color: "color-mix(in srgb, var(--color-text) 50%, transparent)" }}>
            No groups yet.
          </div>
        )}
      </div>

      <div style={{ flex: 1 }} />
      <div style={{ padding: "12px 16px 16px", borderTop: "1px solid var(--color-divider)" }}>
        <button className="btn btn-secondary btn-block" onClick={() => signOut({ callbackUrl: "/login" })}>
          Log out
        </button>
      </div>
    </aside>
  );
}
