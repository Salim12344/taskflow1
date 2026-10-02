"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";

const FEATURES = [
  {
    title: "Invite-only groups",
    desc: "No public discovery. Bring people in with a direct email invite or a shareable link, and see who's joined versus still pending.",
    bg: "var(--color-blue-bg)",
    fg: "var(--color-blue)",
    icon: <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />,
  },
  {
    title: "Projects & Kanban boards",
    desc: "Break work into projects, then track tasks across To do, In progress, Pending review, and Done — plus a calendar view for deadlines.",
    bg: "var(--color-teal-bg)",
    fg: "var(--color-teal)",
    icon: <path d="M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z" />,
  },
  {
    title: "Admin-reviewed workflow",
    desc: "Assignees submit work for review; admins approve or reject with a reason. Every rejection is logged and posted straight into task chat.",
    bg: "var(--color-amber-bg)",
    fg: "var(--color-amber)",
    icon: <path d="M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />,
  },
  {
    title: "Private task chat",
    desc: "Each task gets its own thread between assignee and assigner — separate from the noisy group channel.",
    bg: "var(--color-pink-bg)",
    fg: "var(--color-pink)",
    icon: <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" />,
  },
  {
    title: "Roles that make sense",
    desc: "Organization owners get admin rights across every group they own. Groups always keep at least one admin, enforced server-side.",
    bg: "var(--color-green-bg)",
    fg: "var(--color-green)",
    icon: <path d="M12 2l8 4v6c0 5-3.4 8.4-8 10-4.6-1.6-8-5-8-10V6l8-4z" />,
  },
  {
    title: "Direct messages",
    desc: "Message any group member privately, with read receipts and unread badges, without leaving the app.",
    bg: "var(--color-accent-700)",
    fg: "var(--color-accent-100)",
    icon: <path d="M4 4h16v12H7l-3 3z" />,
  },
];

const STEPS = [
  { n: "01", title: "Create a group", desc: "Individuals and organizations can both spin up a group in seconds. You're the admin from the start.", color: "var(--color-blue)" },
  { n: "02", title: "Invite your people", desc: "Send email invites or drop a link in your existing chat — people join as members, no public browsing required.", color: "var(--color-teal)" },
  { n: "03", title: "Assign & track", desc: "Spin up projects, hand out tasks, and watch them move from To do to Done with a review step admins control.", color: "var(--color-amber)" },
];

const STATS = [
  { n: "4", label: "task states, start to finish" },
  { n: "3", label: "chat layers: group, task, DM" },
  { n: "2", label: "invite methods — email or link" },
  { n: "1", label: "place for all of it" },
];

const AUDIENCES = [
  { title: "Work & product teams", desc: "Marketing squads, agencies, and departments running multiple projects with real accountability." },
  { title: "Research & project groups", desc: "Coordinate research tasks, shared deliverables, and discussions without losing context in a scrolling group chat." },
  { title: "Operations & departments", desc: "Assign responsibilities, track milestones, and ensure admin-reviewed completion across every deliverable." },
];

export default function HomePage() {
  const { status } = useSession();

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, padding: "16px clamp(16px, 5vw, 40px)", borderBottom: "1px solid var(--color-divider)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: "var(--color-accent-700)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent-100)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12l5 5L20 6" /></svg>
          </div>
          <div style={{ fontFamily: "var(--font-heading)", fontWeight: 600, fontSize: 16 }}>TaskFlow</div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          {status === "authenticated" ? (
            <Link className="btn btn-primary" href="/dashboard">Go to dashboard</Link>
          ) : (
            <>
              <Link className="btn btn-secondary" href="/login">Log in</Link>
              <Link className="btn btn-primary" href="/signup">Sign up</Link>
            </>
          )}
        </div>
      </header>

      <main style={{ flex: 1 }}>
        {/* Hero */}
        <section
          className="tf-fade"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "clamp(24px, 5vw, 64px)",
            flexWrap: "wrap",
            padding: "88px clamp(20px, 5vw, 40px) 72px",
            background:
              "radial-gradient(ellipse 70% 60% at 20% -10%, color-mix(in srgb, var(--color-accent) 14%, transparent), transparent), " +
              "radial-gradient(ellipse 50% 40% at 100% 20%, color-mix(in srgb, var(--color-blue) 8%, transparent), transparent)",
          }}
        >
          <div style={{ maxWidth: 560, textAlign: "left", flex: "1 1 420px" }}>
            <div className="tag tag-accent" style={{ marginBottom: 18 }}>Groups · Projects · Tasks</div>
            <h1 style={{ fontSize: "clamp(34px, 4.5vw, 48px)", lineHeight: 1.1, marginBottom: 18, letterSpacing: "-0.02em" }}>
              Run your team&rsquo;s work without the group-chat chaos.
            </h1>
            <p style={{ fontSize: 16, lineHeight: 1.6, color: "color-mix(in srgb, var(--color-text) 65%, transparent)", marginBottom: 30 }}>
              TaskFlow combines group chat with structured projects and tasks —
              invite-only membership, admin-reviewed task workflows, and private task threads,
              all in one place.
            </p>
            <div style={{ display: "flex", gap: 12 }}>
              {status === "authenticated" ? (
                <Link className="btn btn-primary" href="/dashboard" style={{ padding: "10px 22px", fontSize: 14 }}>Go to dashboard</Link>
              ) : (
                <>
                  <Link className="btn btn-primary" href="/signup" style={{ padding: "10px 22px", fontSize: 14 }}>Get started</Link>
                  <Link className="btn btn-secondary" href="/login" style={{ padding: "10px 22px", fontSize: 14 }}>Log in</Link>
                </>
              )}
            </div>
          </div>

          {/* Signature: a real slice of the actual Kanban board — same status-solid cards the
              product uses, not a generic decorative graphic — so the hero shows product truth. */}
          <div className="hero-board" style={{ position: "relative", flex: "1 1 320px", maxWidth: 380, minHeight: 260 }} aria-hidden="true">
            {[
              { title: "Payment integration", meta: "Chloe Yamamoto", status: "todo", rotate: -4, top: 0, left: 20 },
              { title: "Refactor notification service", meta: "Due 7/26", status: "in_progress", rotate: 2, top: 70, left: 70 },
              { title: "Mobile app QA pass", meta: "Approved", status: "done", rotate: -2, top: 150, left: 10 },
            ].map((c) => (
              <div
                key={c.title}
                className="card elev-sm status-solid hero-board-card"
                style={{
                  "--rail-color": `var(--status-${c.status})`,
                  "--card-rotate": `${c.rotate}deg`,
                  position: "absolute",
                  top: c.top,
                  left: c.left,
                  width: 250,
                  transform: `rotate(${c.rotate}deg)`,
                } as React.CSSProperties}
              >
                <div className="card-title" style={{ fontSize: 14 }}>{c.title}</div>
                <div className="card-meta">{c.meta}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Stats bar */}
        <section style={{ borderTop: "1px solid var(--color-divider)", borderBottom: "1px solid var(--color-divider)", background: "var(--color-surface)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", maxWidth: 1000, margin: "0 auto", padding: "28px clamp(16px, 5vw, 40px)" }}>
            {STATS.map((s) => (
              <div key={s.label} style={{ textAlign: "center", padding: "8px 12px" }}>
                <div className="stat-number">{s.n}</div>
                <div style={{ fontSize: 12.5, color: "color-mix(in srgb, var(--color-text) 60%, transparent)", marginTop: 4 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section style={{ padding: "56px clamp(16px, 5vw, 40px) 72px", maxWidth: 1000, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 36 }}>
            <h2 style={{ fontSize: 24, marginBottom: 8 }}>How it works</h2>
            <p style={{ fontSize: 14, color: "color-mix(in srgb, var(--color-text) 60%, transparent)" }}>From zero to organized in three steps.</p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 20 }}>
            {STEPS.map((s) => (
              <div key={s.n} className="card elev-sm card-hover-lift">
                <div style={{ fontFamily: "var(--font-heading)", fontSize: 22, fontWeight: 700, color: s.color }}>{s.n}</div>
                <div className="card-title">{s.title}</div>
                <div className="card-body">{s.desc}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Features */}
        <section style={{ padding: "0 clamp(16px, 5vw, 40px) 88px", maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 36 }}>
            <h2 style={{ fontSize: 24, marginBottom: 8 }}>Everything a group needs</h2>
            <p style={{ fontSize: 14, color: "color-mix(in srgb, var(--color-text) 60%, transparent)" }}>Built for project squads, departments, organizations, and fast-moving teams.</p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 18 }}>
            {FEATURES.map((f) => (
              <div key={f.title} className="card elev-sm card-hover-lift" style={{ textAlign: "left" }}>
                <div className="feature-icon" style={{ background: f.bg }}>
                  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke={f.fg} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{f.icon}</svg>
                </div>
                <div className="card-title">{f.title}</div>
                <div className="card-body">{f.desc}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Who it's for */}
        <section style={{ padding: "0 clamp(16px, 5vw, 40px) 88px", maxWidth: 1000, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 36 }}>
            <h2 style={{ fontSize: 24, marginBottom: 8 }}>Made for any kind of group</h2>
            <p style={{ fontSize: 14, color: "color-mix(in srgb, var(--color-text) 60%, transparent)" }}>If you coordinate people and tasks, TaskFlow fits.</p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 18 }}>
            {AUDIENCES.map((a) => (
              <div key={a.title} className="card elev-sm" style={{ textAlign: "left", boxShadow: "inset 0 2px 0 var(--color-accent), var(--shadow-sm)" }}>
                <div className="card-title">{a.title}</div>
                <div className="card-body">{a.desc}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Quote */}
        <section style={{ padding: "0 clamp(16px, 5vw, 40px) 88px", textAlign: "center" }}>
          <div style={{ maxWidth: 640, margin: "0 auto" }}>
            <div style={{ fontSize: 40, color: "var(--color-accent-300)", lineHeight: 1, marginBottom: 4 }}>&ldquo;</div>
            <p style={{ fontSize: 18, lineHeight: 1.6, marginBottom: 14 }}>
              The review step alone fixed our biggest problem — work getting marked &ldquo;done&rdquo; that wasn&rsquo;t actually done.
            </p>
            <div style={{ fontSize: 13, color: "color-mix(in srgb, var(--color-text) 55%, transparent)" }}>Every admin, probably, after week one.</div>
          </div>
        </section>

        {/* CTA */}
        <section style={{ padding: "0 clamp(16px, 5vw, 40px) 96px", textAlign: "center" }}>
          <div className="card elev-sm" style={{ maxWidth: 560, margin: "0 auto", alignItems: "center", padding: "36px 32px", background: "linear-gradient(135deg, var(--color-surface), color-mix(in srgb, var(--color-accent) 8%, var(--color-surface)))" }}>
            {status === "authenticated" ? (
              <>
                <h2 style={{ fontSize: 22, marginBottom: 6 }}>Pick up where you left off</h2>
                <p style={{ fontSize: 13.5, color: "color-mix(in srgb, var(--color-text) 60%, transparent)", marginBottom: 18 }}>
                  Your groups, projects, and tasks are waiting.
                </p>
                <Link className="btn btn-primary" href="/dashboard" style={{ padding: "10px 24px", fontSize: 14 }}>Go to dashboard</Link>
              </>
            ) : (
              <>
                <h2 style={{ fontSize: 22, marginBottom: 6 }}>Ready to get your team organized?</h2>
                <p style={{ fontSize: 13.5, color: "color-mix(in srgb, var(--color-text) 60%, transparent)", marginBottom: 18 }}>
                  Create a group, invite your people, and assign your first task in under two minutes.
                </p>
                <Link className="btn btn-primary" href="/signup" style={{ padding: "10px 24px", fontSize: 14 }}>Create your account</Link>
              </>
            )}
          </div>
        </section>
      </main>

      <footer style={{ borderTop: "1px solid var(--color-divider)", padding: "18px clamp(16px, 5vw, 40px)", fontSize: 12, color: "color-mix(in srgb, var(--color-text) 50%, transparent)", textAlign: "center" }}>
        TaskFlow — groups, projects, and tasks in one place.
      </footer>
    </div>
  );
}
