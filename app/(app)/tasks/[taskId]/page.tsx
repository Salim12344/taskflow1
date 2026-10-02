"use client";

import { useEffect, useRef, useState, use as usePromise } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { api, uploadFile, type Attachment } from "@/lib/api-client";
import { Avatar } from "@/components/Avatar";
import { AttachmentView } from "@/components/AttachmentView";
import { useVoiceRecorder } from "@/lib/use-voice-recorder";
import { statusColorVar } from "@/lib/status";
import { onKeyActivate } from "@/lib/a11y";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useStickToBottom } from "@/lib/use-stick-to-bottom";
import { ErrorBanner } from "@/components/ErrorBanner";
import { isOverdue } from "@/lib/deadline";

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
  reviewerId: string | null;
  pendingReviewDelegation: { toUserId: string; fromUserId: string; createdAt: string } | null;
};
type Project = { _id: string; name: string; groupId: string };
type Member = { userId: { _id: string; name: string; avatarUrl: string | null }; role: "admin" | "member" };
type ReplyTo = { messageId: string; text: string; senderName: string };
type ChatMessage = { _id: string; text: string; senderId: string; createdAt: string; replyTo: ReplyTo | null; attachments: Attachment[] };

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
  const [error, setError] = useState<unknown>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [showReject, setShowReject] = useState(false);
  const [delegateTarget, setDelegateTarget] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatCanWrite, setChatCanWrite] = useState(false);
  const [composer, setComposer] = useState("");
  const [replyingTo, setReplyingTo] = useState<{ _id: string; text: string; senderName: string } | null>(null);
  const [sendingAttachment, setSendingAttachment] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [reassigning, setReassigning] = useState(false);
  const voice = useVoiceRecorder();
  const initialUnreadRef = useRef<number | null>(null);
  const dividerRef = useRef<HTMLDivElement>(null);
  const scrolledToUnreadRef = useRef(false);
  const hasUnread = (initialUnreadRef.current ?? 0) > 0;
  const { containerRef: chatContainerRef, endRef: chatEndRef, onScroll: onChatScroll } = useStickToBottom(chatMessages, { skipInitialScroll: hasUnread });
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      .then((d) => { setMembers(d.members); setError(null); })
      .catch((e) => setError(e));
  }

  useEffect(load, [taskId]);

  function loadChat() {
    api<{ messages: ChatMessage[]; canWrite: boolean; unreadCount: number }>(`/api/tasks/${taskId}/chat`)
      .then((d) => {
        setChatMessages(d.messages);
        setChatCanWrite(d.canWrite);
        if (initialUnreadRef.current === null) initialUnreadRef.current = d.unreadCount;
      })
      .catch(() => {});
  }

  useEffect(() => {
    loadChat();
    const interval = setInterval(loadChat, 1500);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  useEffect(() => {
    if (scrolledToUnreadRef.current) return;
    if (initialUnreadRef.current === null || initialUnreadRef.current === 0) return;
    if (chatMessages.length === 0) return;
    scrolledToUnreadRef.current = true;
    requestAnimationFrame(() => dividerRef.current?.scrollIntoView({ block: "start", behavior: "instant" }));
  }, [chatMessages.length]);


  const userId = session?.user?.id;
  const isAssignee = task?.assignedTo === userId;
  // Approximates server enforcement for showing/hiding buttons; server is the source of truth.
  // An org owner may not have an explicit GroupMember row, so accountType fills that gap here.
  const isOrgAccount = session?.user?.accountType === "organization";
  const isAdmin = isOrgAccount || members.some((m) => m.userId._id === userId && m.role === "admin");
  const isCreator = task?.createdBy === userId;
  const nameFor = (id: string | null) => (id ? members.find((m) => m.userId._id === id)?.userId.name ?? "—" : "Unassigned");
  const otherAdmins = members.filter((m) => m.role === "admin" && m.userId._id !== userId);

  // Default manager is whoever created/assigned the task, not "any admin" — that's the whole
  // point of delegation existing. Once delegated, control fully moves to that admin (plus the
  // org owner, who always keeps an emergency fallback to act on the task).
  const isDesignatedManager = !!task?.reviewerId && task.reviewerId === userId;
  const canManage = task?.reviewerId ? isDesignatedManager || isOrgAccount : isCreator || isOrgAccount;
  // Handing a task off reassigns who's accountable for it — narrower than canManage, so even
  // the org owner's emergency override doesn't extend to it, only the creator/current delegate.
  const canDelegate = isDesignatedManager || (!task?.reviewerId && isCreator);
  const delegation = task?.pendingReviewDelegation ?? null;
  const isDelegationTarget = !!delegation && delegation.toUserId === userId;

  async function moveStatus(status: string, reason?: string) {
    if (submitting) return;
    setSubmitting(true);
    try {
      await api(`/api/tasks/${taskId}`, { method: "PATCH", body: JSON.stringify({ status, reason }) });
      setShowReject(false);
      setRejectReason("");
      load();
    } catch (e) {
      setError(e);
    } finally {
      setSubmitting(false);
    }
  }

  async function reassign(newAssignee: string) {
    setReassigning(true);
    try {
      await api(`/api/tasks/${taskId}`, { method: "PATCH", body: JSON.stringify({ assignedTo: newAssignee || null }) });
      load();
    } catch (e) {
      setError(e);
    } finally {
      setReassigning(false);
    }
  }

  async function sendDelegate() {
    if (!delegateTarget || submitting) return;
    setSubmitting(true);
    try {
      await api(`/api/tasks/${taskId}/delegate-review`, { method: "POST", body: JSON.stringify({ toUserId: delegateTarget }) });
      setDelegateTarget("");
      load();
    } catch (e) {
      setError(e);
    } finally {
      setSubmitting(false);
    }
  }

  async function cancelDelegate() {
    if (submitting) return;
    setSubmitting(true);
    try {
      await api(`/api/tasks/${taskId}/delegate-review`, { method: "DELETE" });
      load();
    } catch (e) {
      setError(e);
    } finally {
      setSubmitting(false);
    }
  }

  async function respondToDelegate(accept: boolean) {
    if (submitting) return;
    setSubmitting(true);
    try {
      await api(`/api/tasks/${taskId}/delegate-review/respond`, { method: "POST", body: JSON.stringify({ accept }) });
      load();
    } catch (e) {
      setError(e);
    } finally {
      setSubmitting(false);
    }
  }

  async function sendChatMessage() {
    if (!composer.trim()) return;
    const text = composer;
    const reply = replyingTo;
    setComposer("");
    setReplyingTo(null);
    try {
      await api(`/api/tasks/${taskId}/chat`, { method: "POST", body: JSON.stringify({ text, replyToId: reply?._id }) });
      loadChat();
    } catch (e) {
      // Restore what was typed — losing a message to a network blip on top of the failure is worse than the failure itself.
      setComposer(text);
      setReplyingTo(reply);
      setError(e);
    }
  }

  async function sendAttachment(file: Blob, filename: string) {
    setSendingAttachment(true);
    const reply = replyingTo;
    setReplyingTo(null);
    try {
      const attachment = await uploadFile(file, filename);
      await api(`/api/tasks/${taskId}/chat`, { method: "POST", body: JSON.stringify({ text: "", attachments: [attachment], replyToId: reply?._id }) });
      loadChat();
    } catch (e) {
      setReplyingTo(reply);
      setError(e);
    } finally {
      setSendingAttachment(false);
    }
  }

  async function toggleVoice() {
    if (voice.isRecordingRef.current) {
      const blob = await voice.stop();
      if (blob && blob.size > 0) await sendAttachment(blob, `voice-note.${blob.type.includes("mp4") ? "m4a" : "webm"}`);
    } else {
      await voice.start();
    }
  }

  function onFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) sendAttachment(file, file.name);
  }

  if (!task) {
    return (
      <div className="tf-fade page-pad" style={{ padding: "24px 40px" }}>
        {error ? <ErrorBanner error={error} onRetry={load} /> : "Loading…"}
      </div>
    );
  }

  return (
    <div className="tf-fade page-pad" style={{ padding: "24px 40px 40px" }}>
      <div role="link" tabIndex={0} onClick={() => router.push(`/projects/${task.projectId}`)} onKeyDown={onKeyActivate(() => router.push(`/projects/${task.projectId}`))} className="back-link" style={{ marginBottom: 14 }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        {project?.name ?? "Back"}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18 }}>
        <h3>{task.title}</h3>
        <span className="tag" style={{ background: `color-mix(in srgb, ${statusColorVar(task.status)} 18%, transparent)`, color: statusColorVar(task.status) }}>{STATUS_LABEL[task.status]}</span>
      </div>
      <ErrorBanner error={error} onRetry={load} />

      <div className="detail-grid-2col" style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 24, alignItems: "start" }}>
        <div className="card elev-sm">
          <div className="card-title" style={{ fontSize: 14 }}>Description</div>
          <div style={{ fontSize: 13.5, lineHeight: 1.6, opacity: 0.85 }}>{task.description || "No description."}</div>

          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 12, color: "color-mix(in srgb, var(--color-text) 60%, transparent)", marginBottom: 4 }}>Assignee</div>
            {isAdmin && canManage ? (
              <select
                className="input"
                style={{ width: "auto", fontSize: 13.5 }}
                value={task.assignedTo ?? ""}
                disabled={reassigning}
                onChange={(e) => reassign(e.target.value)}
              >
                <option value="">Unassigned</option>
                {members.filter((m) => m.role === "member").map((m) => (
                  <option key={m.userId._id} value={m.userId._id}>{m.userId.name}</option>
                ))}
              </select>
            ) : (
              <div style={{ fontSize: 14 }}>{nameFor(task.assignedTo)}</div>
            )}
          </div>
          {task.deadline && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 12, color: "color-mix(in srgb, var(--color-text) 60%, transparent)", marginBottom: 4 }}>Due date</div>
              <div style={{ fontSize: 14, color: isOverdue(task.deadline, task.status) ? "oklch(75% 0.15 25)" : undefined }}>
                {new Date(task.deadline).toLocaleDateString()}
                {isOverdue(task.deadline, task.status) && <span style={{ marginLeft: 6, fontSize: 11.5, fontWeight: 600 }}>Overdue</span>}
              </div>
            </div>
          )}

          {task.status !== "done" && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 12, color: "color-mix(in srgb, var(--color-text) 60%, transparent)", marginBottom: 4 }}>Managed by</div>

              {delegation ? (
                isDelegationTarget ? (
                  <div>
                    <div style={{ fontSize: 13.5, marginBottom: 6 }}>
                      {nameFor(delegation.fromUserId)} wants to hand off this task to you — you&rsquo;d edit, reassign, delete, and approve/reject it going forward.
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button className="btn btn-primary" style={{ padding: "4px 10px", fontSize: 12.5 }} disabled={submitting} onClick={() => respondToDelegate(true)}>Accept</button>
                      <button className="btn btn-secondary" style={{ padding: "4px 10px", fontSize: 12.5 }} disabled={submitting} onClick={() => respondToDelegate(false)}>Decline</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: 13.5 }}>
                    Hand-off pending — waiting on {nameFor(delegation.toUserId)} to accept.
                    {delegation.fromUserId === userId && (
                      <button className="btn btn-secondary" style={{ marginLeft: 8, padding: "2px 8px", fontSize: 12 }} disabled={submitting} onClick={cancelDelegate}>Cancel</button>
                    )}
                  </div>
                )
              ) : (
                <div style={{ fontSize: 14 }}>{nameFor(task.reviewerId ?? task.createdBy)}</div>
              )}

              {canDelegate && !delegation && otherAdmins.length > 0 && (
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <select className="input" value={delegateTarget} onChange={(e) => setDelegateTarget(e.target.value)}>
                    <option value="">{task.reviewerId ? "Hand off to…" : "Hand off to…"}</option>
                    {otherAdmins.map((m) => <option key={m.userId._id} value={m.userId._id}>{m.userId.name}</option>)}
                  </select>
                  <button className="btn btn-secondary" disabled={submitting} onClick={sendDelegate}>Send</button>
                </div>
              )}
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
            {isAssignee && task.status === "todo" && <button className="btn btn-primary" disabled={submitting} onClick={() => moveStatus("in_progress")}>Start task</button>}
            {isAssignee && task.status === "in_progress" && <button className="btn btn-primary" disabled={submitting} onClick={() => moveStatus("pending_review")}>Submit for review</button>}
            {canManage && task.status === "pending_review" && (
              <>
                <button className="btn btn-primary" disabled={submitting} onClick={() => moveStatus("done")}>Approve</button>
                <button className="btn btn-secondary" style={{ color: "var(--color-accent-300)" }} disabled={submitting} onClick={() => setShowReject((s) => !s)}>Reject</button>
              </>
            )}
          </div>

          {showReject && (
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <input className="input" placeholder="Reason for rejection" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
              <button className="btn btn-primary" disabled={submitting} onClick={() => rejectReason && moveStatus("in_progress", rejectReason)}>Send</button>
            </div>
          )}
        </div>

        <div className="card elev-sm" style={{ height: 480 }}>
          <div className="card-title">Task chat</div>
          {!chatCanWrite && (
            <div className="card-body">You can view this thread, but only the assignee and the task&rsquo;s manager can post here.</div>
          )}
          <div ref={chatContainerRef} onScroll={onChatScroll} style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
            {chatMessages.length === 0 && <div className="card-meta">No messages yet.</div>}
            {chatMessages.map((m, idx) => {
              const unreadCount = initialUnreadRef.current ?? 0;
              const unreadStartIndex = unreadCount > 0 ? Math.max(0, chatMessages.length - unreadCount) : -1;
              const isUnreadStart = idx === unreadStartIndex;
              const mine = m.senderId === userId;
              const sender = members.find((mem) => mem.userId._id === m.senderId);
              return (
                <div key={m._id} style={{ display: "contents" }}>
                  {isUnreadStart && (
                    <div
                      ref={dividerRef}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        margin: "12px 0",
                        color: "var(--color-accent-300)",
                        fontSize: 12,
                        fontWeight: 600,
                      }}
                    >
                      <div style={{ flex: 1, height: 1, background: "color-mix(in srgb, var(--color-accent-300) 40%, transparent)" }} />
                      <span>{unreadCount} unread message{unreadCount > 1 ? "s" : ""}</span>
                      <div style={{ flex: 1, height: 1, background: "color-mix(in srgb, var(--color-accent-300) 40%, transparent)" }} />
                    </div>
                  )}
                  <div className="row-hover tf-msg-in" style={{ display: "flex", gap: 8, alignSelf: mine ? "flex-end" : "flex-start", flexDirection: mine ? "row-reverse" : "row", maxWidth: "80%" }}>
                    {!mine && <Avatar name={sender?.userId.name ?? "?"} avatarUrl={sender?.userId.avatarUrl} size={24} />}
                    <div style={{ display: "flex", flexDirection: "column", alignItems: mine ? "flex-end" : "flex-start" }}>
                      <div style={{ fontSize: 11, color: "color-mix(in srgb, var(--color-text) 55%, transparent)", marginBottom: 3, padding: "0 2px" }}>
                        {sender?.userId.name ?? "—"} · {new Date(m.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                      </div>
                      <div style={{ display: "flex", gap: 4, alignItems: "flex-end", flexDirection: mine ? "row-reverse" : "row" }}>
                        <div style={{ padding: "9px 13px", borderRadius: 14, fontSize: 14, lineHeight: 1.4, background: mine ? "var(--color-accent)" : "var(--color-surface)", color: mine ? "var(--color-bg)" : "var(--color-text)" }}>
                          {m.replyTo && (
                            <div style={{ borderLeft: "2px solid currentColor", background: "color-mix(in srgb, currentColor 14%, transparent)", borderRadius: 6, padding: "4px 8px", marginBottom: 6, fontSize: 12.5 }}>
                              <div style={{ fontWeight: 600, opacity: 0.9 }}>{m.replyTo.senderName}</div>
                              <div style={{ opacity: 0.75, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 200 }}>{m.replyTo.text}</div>
                            </div>
                          )}
                          {m.attachments?.map((a, i) => <div key={i} style={{ marginBottom: m.text ? 6 : 0 }}><AttachmentView attachment={a} mine={mine} /></div>)}
                          {m.text}
                        </div>
                        {chatCanWrite && (
                          <button
                            onClick={() => setReplyingTo({ _id: m._id, text: m.text || "📎 Attachment", senderName: sender?.userId.name ?? "—" })}
                            title="Reply"
                            aria-label={`Reply to ${sender?.userId.name ?? "message"}`}
                            style={{ background: "none", border: "none", cursor: "pointer", padding: 4, opacity: 0.55, flex: "none" }}
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 17l-5-5 5-5M4 12h10a5 5 0 015 5v2" /></svg>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={chatEndRef} />
          </div>
          {chatCanWrite && replyingTo && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", marginBottom: 8, background: "var(--color-bg)", borderRadius: 8 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent-300)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flex: "none" }}><path d="M9 17l-5-5 5-5M4 12h10a5 5 0 015 5v2" /></svg>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11.5, fontWeight: 600, color: "var(--color-accent-300)" }}>{replyingTo.senderName}</div>
                <div style={{ fontSize: 12, opacity: 0.7, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{replyingTo.text}</div>
              </div>
              <button className="btn btn-icon" onClick={() => setReplyingTo(null)} aria-label="Cancel reply" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, opacity: 0.6 }}>×</button>
            </div>
          )}
          {chatCanWrite && (
            <div style={{ display: "flex", gap: 8 }}>
              <input ref={fileInputRef} type="file" onChange={onFilePicked} style={{ display: "none" }} />
              <button type="button" className="btn btn-secondary btn-icon" disabled={sendingAttachment || voice.recording} onClick={() => fileInputRef.current?.click()} title="Attach a file" aria-label="Attach a file">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" /></svg>
              </button>
              <input
                className="input"
                placeholder={voice.recording ? "Recording… Tap mic to stop" : "Message…"}
                value={composer}
                disabled={voice.recording}
                onChange={(e) => setComposer(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); sendChatMessage(); } }}
                autoComplete="off"
              />
              {voice.recording && (
                <button
                  type="button"
                  className="btn btn-secondary btn-icon"
                  onClick={() => voice.cancel()}
                  title="Cancel recording"
                  aria-label="Cancel recording"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
                </button>
              )}
              {composer.trim() ? (
                <button className="btn btn-primary btn-icon" type="button" onClick={sendChatMessage} aria-label="Send message">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M3 11l18-8-8 18-2.5-7L3 11z" /></svg>
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-icon"
                  disabled={sendingAttachment}
                  onClick={toggleVoice}
                  title={voice.recording ? "Tap to stop and send voice note" : "Tap to record voice note"}
                  aria-label={voice.recording ? "Stop recording voice note" : "Record voice note"}
                  style={{ background: voice.recording ? "oklch(60% 0.2 25)" : "var(--color-accent)", color: "var(--color-bg)" }}
                >
                  {voice.recording ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" /><path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4" /></svg>
                  )}
                </button>
              )}
            </div>
          )}
          {chatCanWrite && sendingAttachment && <div className="card-meta" style={{ marginTop: 4 }}>Uploading…</div>}
          {chatCanWrite && voice.error && <div style={{ color: "oklch(70% 0.15 25)", fontSize: 12, marginTop: 4 }}>{voice.error}</div>}
        </div>
      </div>
    </div>
  );
}
