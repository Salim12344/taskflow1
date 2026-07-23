"use client";

import { useEffect, useState, use as usePromise } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { api } from "@/lib/api-client";

type Project = { _id: string; name: string; description: string; groupId: string };
type Task = { _id: string; title: string; status: string; assignedTo: string | null; deadline: string | null };
type Member = { userId: { _id: string; name: string }; role: "admin" | "member" };

const COLUMNS: { key: string; label: string }[] = [
  { key: "todo", label: "To do" },
  { key: "in_progress", label: "In progress" },
  { key: "pending_review", label: "Pending review" },
  { key: "done", label: "Done" },
];

export default function ProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = usePromise(params);
  const router = useRouter();
  const { data: session } = useSession();

  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [members, setMembers] = useState<Member[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    api<{ project: Project }>(`/api/projects/${projectId}`)
      .then((d) => {
        setProject(d.project);
        return api<{ members: Member[] }>(`/api/groups/${d.project.groupId}/members`);
      })
      .then((d) => setMembers(d.members))
      .catch((e) => setError(e.message));
    api<{ tasks: Task[] }>(`/api/projects/${projectId}/tasks`)
      .then((d) => setTasks(d.tasks))
      .catch((e) => setError(e.message));
  }

  useEffect(load, [projectId]);

  const isAdmin = members?.some((m) => m.userId._id === session?.user?.id && m.role === "admin");
  const nameFor = (userId: string | null) => (userId ? members?.find((m) => m.userId._id === userId)?.userId.name ?? "—" : "Unassigned");

  return (
    <div className="tf-fade page-pad" style={{ padding: "24px 40px 40px", display: "flex", flexDirection: "column", height: "100%" }}>
      <div onClick={() => project && router.push(`/groups/${project.groupId}`)} className="back-link" style={{ marginBottom: 14, width: "fit-content" }}>
        ← Back to group
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <h2>{project?.name ?? "…"}</h2>
        {isAdmin && <button className="btn btn-primary" onClick={() => router.push(`/projects/${projectId}/new-task`)}>New task</button>}
      </div>
      <div style={{ fontSize: 13, color: "color-mix(in srgb, var(--color-text) 55%, transparent)", marginBottom: 16 }}>{project?.description}</div>
      {error && <div style={{ color: "oklch(70% 0.15 25)", fontSize: 13, marginBottom: 16 }}>{error}</div>}

      <div className="kanban-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, flex: 1, minHeight: 0 }}>
        {COLUMNS.map((col) => {
          const colTasks = tasks?.filter((t) => t.status === col.key) ?? [];
          return (
            <div key={col.key} style={{ display: "flex", flexDirection: "column", gap: 10, minHeight: 0 }}>
              <div style={{ fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase", color: "color-mix(in srgb, var(--color-text) 55%, transparent)" }}>
                {col.label} · {colTasks.length}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, overflowY: "auto" }}>
                {colTasks.map((t) => (
                  <div key={t._id} className="card elev-sm kanban-card" onClick={() => router.push(`/tasks/${t._id}`)}>
                    <div className="card-title" style={{ fontSize: 14.5 }}>{t.title}</div>
                    <div className="card-meta">{nameFor(t.assignedTo)}</div>
                    {t.deadline && <div className="card-meta"><span className="tag tag-outline">Due {new Date(t.deadline).toLocaleDateString()}</span></div>}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
