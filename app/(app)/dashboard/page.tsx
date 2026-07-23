"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import { groupIcon } from "@/lib/group-icon";

type Group = { _id: string; name: string; orgId: string | null };

export default function DashboardPage() {
  const router = useRouter();
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);

  function load() {
    api<{ groups: Group[] }>("/api/groups")
      .then((d) => setGroups(d.groups))
      .catch((e) => setError(e.message));
  }

  useEffect(load, []);

  async function createGroup(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      const { group } = await api<{ group: Group }>("/api/groups", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      setShowNew(false);
      setName("");
      window.dispatchEvent(new Event("taskflow:groups-changed"));
      router.push(`/groups/${group._id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="tf-fade page-pad" style={{ padding: "32px 40px 40px", maxWidth: 1100 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <h2>Your groups</h2>
        <button className="btn btn-primary" onClick={() => setShowNew((s) => !s)}>New group</button>
      </div>
      <div style={{ fontSize: 13, color: "color-mix(in srgb, var(--color-text) 55%, transparent)", marginBottom: 22 }}>
        Groups you belong to across your account.
      </div>

      {showNew && (
        <form onSubmit={createGroup} className="card elev-sm" style={{ maxWidth: 400, marginBottom: 24, flexDirection: "row", gap: 8 }}>
          <input className="input" placeholder="Group name" required value={name} onChange={(e) => setName(e.target.value)} />
          <button className="btn btn-primary" disabled={creating} type="submit">Create</button>
        </form>
      )}

      {error && <div style={{ color: "oklch(70% 0.15 25)", fontSize: 13, marginBottom: 16 }}>{error}</div>}

      {groups === null && !error && <div className="card-meta">Loading…</div>}
      {groups?.length === 0 && <div className="card-meta">No groups yet — create one to get started.</div>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 16 }}>
        {groups?.map((g) => {
          const icon = groupIcon(g.name);
          return (
            <div key={g._id} className="card elev-sm card-clickable" onClick={() => router.push(`/groups/${g._id}`)}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: icon.bg, color: icon.fg, fontSize: 14, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {icon.letter}
              </div>
              <div className="card-title">{g.name}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
