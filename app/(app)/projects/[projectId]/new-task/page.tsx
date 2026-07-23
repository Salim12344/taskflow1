"use client";

import { useEffect, useState, use as usePromise } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";

type Project = { _id: string; name: string; groupId: string };
type Member = { userId: { _id: string; name: string }; role: "admin" | "member" };

export default function NewTaskPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = usePromise(params);
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [deadline, setDeadline] = useState("");
  const [recurrence, setRecurrence] = useState("none");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ project: Project }>(`/api/projects/${projectId}`)
      .then((d) => {
        setProject(d.project);
        return api<{ members: Member[] }>(`/api/groups/${d.project.groupId}/members`);
      })
      .then((d) => setMembers(d.members))
      .catch((e) => setError(e.message));
  }, [projectId]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api(`/api/projects/${projectId}/tasks`, {
        method: "POST",
        body: JSON.stringify({
          title,
          description,
          assignedTo: assignedTo || null,
          deadline: deadline || null,
          recurrence,
        }),
      });
      router.push(`/projects/${projectId}`);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="tf-fade page-pad" style={{ padding: "24px 40px 40px", minHeight: "100%", display: "flex", flexDirection: "column" }}>
      <div onClick={() => router.push(`/projects/${projectId}`)} className="back-link" style={{ marginBottom: 18, width: "fit-content" }}>
        ← {project?.name ?? "Back"}
      </div>
      <h2 style={{ marginBottom: 18 }}>New task</h2>
      <div style={{ flex: 1, display: "flex", justifyContent: "center" }}>
        <form onSubmit={onSubmit} className="card elev-sm" style={{ width: "100%", maxWidth: 640, height: "fit-content" }}>
          <div className="field"><label>Title</label><input className="input" required value={title} onChange={(e) => setTitle(e.target.value)} /></div>
          <div className="field"><label>Description</label><textarea className="input" rows={5} value={description} onChange={(e) => setDescription(e.target.value)} /></div>
          <div className="form-grid-2col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div className="field">
              <label>Assignee</label>
              <select className="input" value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
                <option value="">Unassigned</option>
                {members.filter((m) => m.role === "member").map((m) => <option key={m.userId._id} value={m.userId._id}>{m.userId.name}</option>)}
              </select>
            </div>
            <div className="field"><label>Due date</label><input className="input" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} /></div>
          </div>
          <div className="field">
            <label>Recurrence</label>
            <select className="input" value={recurrence} onChange={(e) => setRecurrence(e.target.value)}>
              <option value="none">None</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>
          {error && <div style={{ color: "oklch(70% 0.15 25)", fontSize: 12.5 }}>{error}</div>}
          <button className="btn btn-primary btn-block" type="submit">Create task</button>
        </form>
      </div>
    </div>
  );
}
