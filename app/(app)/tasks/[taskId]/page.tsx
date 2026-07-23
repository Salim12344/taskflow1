"use client";

import { useEffect, useState, use as usePromise } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { api } from "@/lib/api-client";

type Task = {
  _id: string;
  title: string;
  description: string;
  status: string;
  assignedTo: string | null;
  createdBy: string;
  projectId: string;
  deadline: string | null;
  subtasks: { text: string; done: boolean }[];
  rejectionHistory: { reviewerId: string; reason: string; createdAt: string }[];
};
type Project = { _id: string; name: string; groupId: string };
type Member = { userId: { _id: string; name: string }; role: "admin" | "member" };

const STATUS_LABEL: Record<string, string> = {
  todo: "To do",
  in_progress: "In progress",
  pending_review: "Pending review",
  done: "Done",
};

export default function TaskPage({ params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = usePromise(params);
  const router = useRouter();
  const { data: session } = useSession();

  const [task, setTask] = useState<Task | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [showReject, setShowReject] = useState(false);

  function load() {
    api<{ task: Task }>(`/api/tasks/${taskId}`)
      .then((d) => {
        setTask(d.task);
        return api<{ project: Project }>(`/api/projects/${d.task.projectId}`);
      })
      .then((d) => {
        setProject(d.project);
        return api<{ members: Member[] }>(`/api/groups/${d.project.groupId}/members`);
      })
      .then((d) => setMembers(d.members))
      .catch((e) => setError(e.message));
  }

  useEffect(load, [taskId]);

  const userId = session?.user?.id;
  const isAssignee = task?.assignedTo === userId;
  const isAdmin = members.some((m) => m.userId._id === userId && m.role === "admin");
  const isCreator = task?.createdBy === userId;
  const nameFor = (id: string | null) => (id ? members.find((m) => m.userId._id === id)?.userId.name ?? "—" : "Unassigned");

  async function moveStatus(status: string, reason?: string) {
    try {
      await api(`/api/tasks/${taskId}`, { method: "PATCH", body: JSON.stringify({ status, reason }) });
      setShowReject(false);
      setRejectReason("");
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function toggleSubtask(index: number, done: boolean) {
    try {
      await api(`/api/tasks/${taskId}/subtasks`, { method: "PATCH", body: JSON.stringify({ index, done }) });
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function deleteTask() {
    if (!confirm("Delete this task?")) return;
    try {
      await api(`/api/tasks/${taskId}`, { method: "DELETE" });
      router.push(`/projects/${task?.projectId}`);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (!task) {
    return <div className="tf-fade page-pad" style={{ padding: "24px 40px" }}>{error ?? "Loading…"}</div>;
  }

  return (
    <div className="tf-fade page-pad" style={{ padding: "24px 40px 40px" }}>
      <div onClick={() => router.push(`/projects/${task.projectId}`)} className="back-link" style={{ marginBottom: 14 }}>
        ← {project?.name ?? "Back"}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18 }}>
        <h3>{task.title}</h3>
        <span className="tag tag-neutral">{STATUS_LABEL[task.status]}</span>
      </div>
      {error && <div style={{ color: "oklch(70% 0.15 25)", fontSize: 13, marginBottom: 16 }}>{error}</div>}

      <div className="detail-grid-2col" style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 24, alignItems: "start" }}>
        <div className="card elev-sm">
          <div className="card-title" style={{ fontSize: 14 }}>Description</div>
          <div style={{ fontSize: 13.5, lineHeight: 1.6, opacity: 0.85 }}>{task.description || "No description."}</div>

          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 12, color: "color-mix(in srgb, var(--color-text) 60%, transparent)", marginBottom: 4 }}>Assignee</div>
            <div style={{ fontSize: 14 }}>{nameFor(task.assignedTo)}</div>
          </div>
          {task.deadline && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 12, color: "color-mix(in srgb, var(--color-text) 60%, transparent)", marginBottom: 4 }}>Due date</div>
              <div style={{ fontSize: 14 }}>{new Date(task.deadline).toLocaleDateString()}</div>
            </div>
          )}

          {task.subtasks.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 12, color: "color-mix(in srgb, var(--color-text) 60%, transparent)", marginBottom: 6 }}>
                Subtasks ({task.subtasks.filter((s) => s.done).length}/{task.subtasks.length})
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {task.subtasks.map((s, i) => (
                  <label key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5 }}>
                    <input type="checkbox" checked={s.done} onChange={(e) => toggleSubtask(i, e.target.checked)} disabled={!isAssignee && !isAdmin} />
                    <span style={{ textDecoration: s.done ? "line-through" : "none", opacity: s.done ? 0.6 : 1 }}>{s.text}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {task.rejectionHistory.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 12, color: "color-mix(in srgb, var(--color-text) 60%, transparent)", marginBottom: 6 }}>Rejection history</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {task.rejectionHistory.map((r, i) => (
                  <div key={i} className="card-body" style={{ background: "var(--color-bg)", padding: 8, borderRadius: 8 }}>
                    {r.reason} <span style={{ opacity: 0.6 }}>— {new Date(r.createdAt).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
            {isAssignee && task.status === "todo" && <button className="btn btn-primary" onClick={() => moveStatus("in_progress")}>Start task</button>}
            {isAssignee && task.status === "in_progress" && <button className="btn btn-primary" onClick={() => moveStatus("pending_review")}>Submit for review</button>}
            {isAdmin && task.status === "pending_review" && (
              <>
                <button className="btn btn-primary" onClick={() => moveStatus("done")}>Approve</button>
                <button className="btn btn-secondary" style={{ color: "var(--color-accent-300)" }} onClick={() => setShowReject((s) => !s)}>Reject</button>
              </>
            )}
            {(isAdmin || isCreator) && <button className="btn btn-secondary" style={{ color: "var(--color-accent-300)" }} onClick={deleteTask}>Delete task</button>}
          </div>

          {showReject && (
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <input className="input" placeholder="Reason for rejection" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
              <button className="btn btn-primary" onClick={() => rejectReason && moveStatus("in_progress", rejectReason)}>Send</button>
            </div>
          )}
        </div>

        <div className="card elev-sm">
          <div className="card-title">Task chat</div>
          <div className="card-body">Chat between assignee and assigner ships in Phase 2.</div>
        </div>
      </div>
    </div>
  );
}
