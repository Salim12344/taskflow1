"use client";

import { useEffect, useState, use as usePromise } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { api } from "@/lib/api-client";
import { groupIcon } from "@/lib/group-icon";

type Group = { _id: string; name: string };
type Project = { _id: string; name: string; description: string; status: string };
type Member = { _id: string; userId: { _id: string; name: string; email: string }; role: "admin" | "member" };

export default function GroupPage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = usePromise(params);
  const router = useRouter();
  const { data: session } = useSession();

  const [tab, setTab] = useState<"projects" | "members">("projects");
  const [group, setGroup] = useState<Group | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [members, setMembers] = useState<Member[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showNewProject, setShowNewProject] = useState(false);
  const [projectName, setProjectName] = useState("");

  function loadAll() {
    api<{ group: Group; showOnboarding: boolean }>(`/api/groups/${groupId}`)
      .then((d) => { setGroup(d.group); setShowOnboarding(d.showOnboarding); })
      .catch((e) => setError(e.message));
    api<{ projects: Project[] }>(`/api/groups/${groupId}/projects`)
      .then((d) => setProjects(d.projects))
      .catch((e) => setError(e.message));
    api<{ members: Member[] }>(`/api/groups/${groupId}/members`)
      .then((d) => setMembers(d.members))
      .catch((e) => setError(e.message));
  }

  useEffect(loadAll, [groupId]);

  const me = members?.find((m) => m.userId._id === session?.user?.id);
  const isAdmin = me?.role === "admin";

  async function createProject(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api(`/api/groups/${groupId}/projects`, { method: "POST", body: JSON.stringify({ name: projectName }) });
      setProjectName("");
      setShowNewProject(false);
      loadAll();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function dismissOnboarding() {
    await api(`/api/groups/${groupId}`, { method: "PATCH", body: JSON.stringify({ dismissOnboarding: true }) }).catch(() => {});
    setShowOnboarding(false);
  }

  async function setRole(userId: string, role: "admin" | "member") {
    try {
      await api(`/api/groups/${groupId}/members/${userId}`, { method: "PATCH", body: JSON.stringify({ role }) });
      loadAll();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function removeMember(m: Member) {
    if (!confirm(`Remove ${m.userId.name} from the group?`)) return;
    try {
      await api(`/api/groups/${groupId}/members/${m.userId._id}`, { method: "DELETE" });
      loadAll();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function leaveGroup() {
    if (!confirm(`Leave ${group?.name}?`)) return;
    try {
      await api(`/api/groups/${groupId}/leave`, { method: "POST" });
      router.push("/dashboard");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div>
      <div className="tf-fade page-pad" style={{ padding: "24px 40px 0" }}>
        <div onClick={() => router.push("/dashboard")} className="back-link" style={{ marginBottom: 14 }}>
          ← Dashboard
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 2, flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {group && (
              <div style={{ width: 30, height: 30, borderRadius: 8, background: groupIcon(group.name).bg, color: groupIcon(group.name).fg, fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
                {groupIcon(group.name).letter}
              </div>
            )}
            <h2>{group?.name ?? "…"}</h2>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {isAdmin && <button className="btn btn-primary" onClick={() => router.push(`/groups/${groupId}/invite`)}>Invite people</button>}
            <button className="btn btn-secondary" onClick={leaveGroup}>Leave group</button>
          </div>
        </div>
        {error && <div style={{ color: "oklch(70% 0.15 25)", fontSize: 13, margin: "8px 0" }}>{error}</div>}

        {showOnboarding && (
          <div className="card elev-sm" style={{ margin: "12px 0" }}>
            <div className="card-title">Get your group going</div>
            <div className="card-body">Create your first project → Invite your team → Assign a task.</div>
            <button className="btn btn-secondary" style={{ width: "fit-content" }} onClick={dismissOnboarding}>Dismiss</button>
          </div>
        )}

        <div style={{ display: "inline-flex", border: "1px solid var(--color-divider)", borderRadius: 8, overflow: "hidden", margin: "22px 0" }}>
          <div onClick={() => setTab("projects")} className={`tab-btn ${tab === "projects" ? "tab-active" : ""}`} style={{ background: tab === "projects" ? "var(--color-accent)" : "transparent", color: tab === "projects" ? "var(--color-bg)" : "inherit" }}>Projects</div>
          <div onClick={() => setTab("members")} className={`tab-btn ${tab === "members" ? "tab-active" : ""}`} style={{ borderLeft: "1px solid var(--color-divider)", background: tab === "members" ? "var(--color-accent)" : "transparent", color: tab === "members" ? "var(--color-bg)" : "inherit" }}>Members</div>
        </div>
      </div>

      {tab === "projects" && (
        <div className="page-pad" style={{ padding: "0 40px 40px" }}>
          {isAdmin && (
            <div style={{ marginBottom: 16 }}>
              {!showNewProject ? (
                <button className="btn btn-secondary" onClick={() => setShowNewProject(true)}>New project</button>
              ) : (
                <form onSubmit={createProject} style={{ display: "flex", gap: 8, maxWidth: 420 }}>
                  <input className="input" placeholder="Project name" required value={projectName} onChange={(e) => setProjectName(e.target.value)} />
                  <button className="btn btn-primary" type="submit">Create</button>
                </form>
              )}
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: 16 }}>
            {projects?.map((p) => (
              <div key={p._id} className="card elev-sm card-clickable" onClick={() => router.push(`/projects/${p._id}`)}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <div className="card-title">{p.name}</div>
                  <span className="tag tag-accent">{p.status}</span>
                </div>
                <div className="card-body">{p.description}</div>
              </div>
            ))}
            {projects?.length === 0 && <div className="card-meta">No projects yet.</div>}
          </div>
        </div>
      )}

      {tab === "members" && (
        <div className="page-pad" style={{ padding: "0 40px 40px" }}>
          <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Name</th><th>Role</th><th></th></tr></thead>
            <tbody>
              {members?.map((m) => (
                <tr key={m._id} className="row-hover" style={{ cursor: "default" }}>
                  <td>
                    <div>{m.userId.name}</div>
                    <div style={{ fontSize: 11.5, color: "color-mix(in srgb, var(--color-text) 50%, transparent)" }}>{m.userId.email}</div>
                  </td>
                  <td><span className={m.role === "admin" ? "tag tag-accent" : "tag tag-neutral"}>{m.role}</span></td>
                  <td style={{ textAlign: "right" }}>
                    {isAdmin && (
                      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                        <button className="btn btn-secondary" style={{ padding: "4px 10px", fontSize: 12 }} onClick={() => setRole(m.userId._id, m.role === "admin" ? "member" : "admin")}>
                          {m.role === "admin" ? "Demote" : "Promote"}
                        </button>
                        <button className="btn btn-secondary" style={{ padding: "4px 10px", fontSize: 12, color: "var(--color-accent-300)" }} onClick={() => removeMember(m)}>
                          Remove
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          {!isAdmin && <div style={{ fontSize: 12.5, color: "color-mix(in srgb, var(--color-text) 50%, transparent)", marginTop: 12 }}>Only admins can manage members.</div>}
        </div>
      )}
    </div>
  );
}
