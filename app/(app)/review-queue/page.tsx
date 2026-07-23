"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";

type Section = {
  groupId: string;
  groupName: string;
  tasks: { taskId: string; title: string; projectName: string; submittedAt: string | null }[];
};

export default function ReviewQueuePage() {
  const router = useRouter();
  const [sections, setSections] = useState<Section[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ sections: Section[] }>("/api/review-queue")
      .then((d) => setSections(d.sections))
      .catch((e) => setError(e.message));
  }, []);

  return (
    <div className="tf-fade page-pad" style={{ padding: "32px 40px 40px", maxWidth: 900 }}>
      <h2 style={{ marginBottom: 20 }}>Review queue</h2>
      {error && <div style={{ color: "oklch(70% 0.15 25)", fontSize: 13 }}>{error}</div>}
      {sections?.length === 0 && <div className="card-meta">Nothing waiting on review.</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {sections?.map((s) => (
          <div key={s.groupId}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>{s.groupName}</div>
            <div className="card elev-sm" style={{ gap: 0 }}>
              {s.tasks.map((t) => (
                <div
                  key={t.taskId}
                  onClick={() => router.push(`/tasks/${t.taskId}`)}
                  className="row-hover"
                  style={{ display: "flex", justifyContent: "space-between", padding: "10px 12px", margin: "0 -12px", borderRadius: 8, borderBottom: "1px solid var(--color-divider)" }}
                >
                  <span style={{ fontSize: 13.5 }}>{t.title} <span style={{ opacity: 0.6 }}>· {t.projectName}</span></span>
                  <span style={{ fontSize: 11.5, opacity: 0.6 }}>{t.submittedAt ? new Date(t.submittedAt).toLocaleDateString() : ""}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
