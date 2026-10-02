"use client";

import { useEffect, useRef, useState, use as usePromise } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { api, uploadFile, type Attachment } from "@/lib/api-client";
import { groupIcon } from "@/lib/group-icon";
import { Avatar } from "@/components/Avatar";
import { AttachmentView } from "@/components/AttachmentView";
import { useVoiceRecorder } from "@/lib/use-voice-recorder";
import { isOnline, formatLastSeen } from "@/lib/presence";
import { onKeyActivate } from "@/lib/a11y";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useStickToBottom } from "@/lib/use-stick-to-bottom";
import { ErrorBanner } from "@/components/ErrorBanner";

type Group = { _id: string; name: string };
type Project = { _id: string; name: string; description: string; status: string };
type Member = { _id: string; userId: { _id: string; name: string; email: string; avatarUrl: string | null; lastActiveAt: string | null }; role: "admin" | "member"; canDeleteGroup?: boolean };
type ReadReceipt = { userId: { _id: string; name: string; avatarUrl: string | null }; readAt: string };
type ReplyTo = { messageId: string; text: string; senderName: string };
type ActivityEntry = { _id: string; actorId: { name: string } | null; meta: { text: string }; createdAt: string };
type GroupMessage = {
  _id: string; text: string; senderId: { _id: string; name: string; avatarUrl: string | null } | string;
  createdAt: string; isSystemMessage?: boolean; readBy: ReadReceipt[]; mentions: { _id: string; name: string }[];
  replyTo: ReplyTo | null; attachments: Attachment[];
};

function renderWithMentions(text: string, mentions: { _id: string; name: string }[], mine: boolean) {
  if (mentions.length === 0) return text;
  const names = mentions.map((m) => m.name).sort((a, b) => b.length - a.length);
  const pattern = new RegExp(`(@(?:${names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")}))`, "g");
  const parts = text.split(pattern);
  // A "mine" bubble is already accent-purple — coloring the mention the same purple makes it
  // vanish into its own background, so it gets a contrast-safe highlight instead of a hue swap.
  const mentionStyle: React.CSSProperties = mine
    ? { background: "color-mix(in srgb, var(--color-bg) 22%, transparent)", borderRadius: 4, padding: "0 3px", fontWeight: 700 }
    : { color: "var(--color-accent-300)", fontWeight: 600 };
  return parts.map((part, i) =>
    names.some((n) => part === `@${n}`) ? (
      <span key={i} style={mentionStyle}>{part}</span>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

export default function GroupPage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = usePromise(params);
  const router = useRouter();
  const { data: session } = useSession();

  const [tab, setTab] = useState<"projects" | "chat" | "members" | "activity">("projects");
  const [group, setGroup] = useState<Group | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [members, setMembers] = useState<Member[] | null>(null);
  const [activity, setActivity] = useState<ActivityEntry[] | null>(null);
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [composer, setComposer] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [showNewProject, setShowNewProject] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [seenByModal, setSeenByModal] = useState<ReadReceipt[] | null>(null);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionMap, setMentionMap] = useState<Record<string, string>>({}); // name -> userId
  const [typingUsers, setTypingUsers] = useState<{ _id: string; name: string }[]>([]);
  const [replyingTo, setReplyingTo] = useState<{ _id: string; text: string; senderName: string } | null>(null);
  const [sendingAttachment, setSendingAttachment] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<Member | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [confirmDeleteGroup, setConfirmDeleteGroup] = useState(false);
  const voice = useVoiceRecorder();
  // null = first load not yet complete; number = unread count captured from first API response.
  const initialUnreadRef = useRef<number | null>(null);
  const dividerRef = useRef<HTMLDivElement>(null);
  const scrolledToUnreadRef = useRef(false);
  const hasUnread = (initialUnreadRef.current ?? 0) > 0;
  const { containerRef: chatContainerRef, endRef: chatEndRef, onScroll: onChatScroll } = useStickToBottom(messages, { skipInitialScroll: hasUnread });
  const lastTypingPingRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const seenByCloseRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!seenByModal) return;
    seenByCloseRef.current?.focus();
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setSeenByModal(null);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [seenByModal]);

  function loadAll() {
    api<{ group: Group; showOnboarding: boolean }>(`/api/groups/${groupId}`)
      .then((d) => { setGroup(d.group); setShowOnboarding(d.showOnboarding); setError(null); })
      .catch((e) => setError(e));
    api<{ projects: Project[] }>(`/api/groups/${groupId}/projects`)
      .then((d) => setProjects(d.projects))
      .catch((e) => setError(e));
    api<{ members: Member[] }>(`/api/groups/${groupId}/members`)
      .then((d) => setMembers(d.members))
      .catch((e) => setError(e));
  }

  function loadMessages() {
    api<{ messages: GroupMessage[]; typingUsers: { _id: string; name: string }[]; unreadCount: number }>(`/api/groups/${groupId}/messages`)
      .then((d) => {
        setMessages(d.messages);
        setTypingUsers(d.typingUsers);
        setError(null);
        // Capture unread count only on the very first successful load — subsequent polls must
        // not overwrite it (they'll return 0 because messages are now marked as read).
        if (initialUnreadRef.current === null) initialUnreadRef.current = d.unreadCount;
      })
      .catch((e) => setError(e));
  }

  useEffect(loadAll, [groupId]);

  // Scroll to the unread divider on the very first load, then never again.
  useEffect(() => {
    if (scrolledToUnreadRef.current) return;
    if (initialUnreadRef.current === null || initialUnreadRef.current === 0) return;
    if (messages.length === 0) return;
    scrolledToUnreadRef.current = true;
    // rAF ensures the divider is in the DOM before we scroll.
    requestAnimationFrame(() => dividerRef.current?.scrollIntoView({ block: "start", behavior: "instant" }));
  }, [messages.length]);

  useEffect(() => {
    if (tab !== "chat") return;
    loadMessages();
    const interval = setInterval(loadMessages, 1500);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, groupId]);


  useEffect(() => {
    if (tab !== "activity") return;
    api<{ entries: ActivityEntry[] }>(`/api/groups/${groupId}/activity`)
      .then((d) => setActivity(d.entries))
      .catch((e) => setError(e));
  }, [tab, groupId]);

  const me = members?.find((m) => m.userId._id === session?.user?.id);
  // Org owners are implicit admins of every group their org creates and never actually join
  // as an explicit member — "leave" doesn't apply to them (server rejects it either way).
  const isOrgAccount = session?.user?.accountType === "organization";
  const isAdmin = isOrgAccount || me?.role === "admin";
  const canDelete = isOrgAccount || !!me?.canDeleteGroup;
  const canLeave = !!me && !isOrgAccount;

  async function createProject(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api(`/api/groups/${groupId}/projects`, { method: "POST", body: JSON.stringify({ name: projectName }) });
      setProjectName("");
      setShowNewProject(false);
      loadAll();
    } catch (e) {
      setError(e);
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
      setError(e);
    }
  }

  async function toggleDeletePerm(userId: string, canDeleteGroup: boolean) {
    try {
      await api(`/api/groups/${groupId}/members/${userId}`, { method: "PATCH", body: JSON.stringify({ canDeleteGroup }) });
      loadAll();
    } catch (e) {
      setError(e);
    }
  }

  async function removeMember(m: Member) {
    setConfirmRemove(null);
    try {
      await api(`/api/groups/${groupId}/members/${m.userId._id}`, { method: "DELETE" });
      loadAll();
    } catch (e) {
      setError(e);
    }
  }

  async function leaveGroup() {
    setConfirmLeave(false);
    try {
      await api(`/api/groups/${groupId}/leave`, { method: "POST" });
      router.push("/dashboard");
    } catch (e) {
      setError(e);
    }
  }

  async function deleteGroup() {
    setConfirmDeleteGroup(false);
    try {
      await api(`/api/groups/${groupId}`, { method: "DELETE" });
      router.push("/dashboard");
    } catch (e) {
      setError(e);
    }
  }

  async function sendMessage() {
    if (!composer.trim()) return;
    const text = composer;
    const mentionIds = Object.entries(mentionMap)
      .filter(([name]) => text.includes(`@${name}`))
      .map(([, id]) => id);
    const reply = replyingTo;
    setComposer("");
    setMentionMap({});
    setMentionQuery(null);
    setReplyingTo(null);
    try {
      await api(`/api/groups/${groupId}/messages`, { method: "POST", body: JSON.stringify({ text, mentions: mentionIds, replyToId: reply?._id }) });
      loadMessages();
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
      await api(`/api/groups/${groupId}/messages`, { method: "POST", body: JSON.stringify({ text: "", attachments: [attachment], replyToId: reply?._id }) });
      loadMessages();
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

  function onComposerChange(value: string) {
    setComposer(value);
    const match = value.match(/@([a-zA-Z]*)$/);
    setMentionQuery(match ? match[1] : null);

    const now = Date.now();
    if (now - lastTypingPingRef.current > 2500) {
      lastTypingPingRef.current = now;
      api(`/api/groups/${groupId}/typing`, { method: "POST" }).catch(() => {});
    }
  }

  function pickMention(name: string, userId: string) {
    setComposer((c) => c.replace(/@[a-zA-Z]*$/, `@${name} `));
    setMentionMap((m) => ({ ...m, [name]: userId }));
    setMentionQuery(null);
  }

  async function messageMember(userId: string) {
    try {
      const { threadId } = await api<{ threadId: string }>("/api/dm", {
        method: "POST",
        body: JSON.stringify({ otherUserId: userId }),
      });
      router.push(`/messages/${threadId}?from=group:${groupId}`);
    } catch (e) {
      setError(e);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div className="tf-fade page-pad" style={{ padding: "24px 40px 0", flex: "none" }}>
        <div role="link" tabIndex={0} onClick={() => router.push("/dashboard")} onKeyDown={onKeyActivate(() => router.push("/dashboard"))} className="back-link" style={{ marginBottom: 14 }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          Dashboard
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
            {canLeave && <button className="btn btn-secondary" onClick={() => setConfirmLeave(true)}>Leave group</button>}
            {canDelete && <button className="btn btn-secondary" style={{ color: "var(--color-accent-300)" }} onClick={() => setConfirmDeleteGroup(true)}>Delete group</button>}
          </div>
        </div>
        <ErrorBanner error={error} onRetry={tab === "chat" ? loadMessages : loadAll} style={{ margin: "8px 0" }} />

        {showOnboarding && (
          <div className="card elev-sm" style={{ margin: "12px 0" }}>
            <div className="card-title">Get your group going</div>
            <div className="card-body">Create your first project → Invite your team → Assign a task.</div>
            <button className="btn btn-secondary" style={{ width: "fit-content" }} onClick={dismissOnboarding}>Dismiss</button>
          </div>
        )}

        <div role="tablist" aria-label="Group sections" style={{ display: "inline-flex", border: "1px solid var(--color-divider)", borderRadius: 8, overflow: "hidden", margin: "22px 0" }}>
          {([
            ["projects", "Projects"],
            ["chat", "Chat"],
            ["members", "Members"],
            ...(isAdmin ? [["activity", "Activity"] as const] : []),
          ] as const).map(([key, label], i) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={`tab-btn ${tab === key ? "tab-active" : ""}`}
              style={{ borderLeft: i > 0 ? "1px solid var(--color-divider)" : "none", background: tab === key ? "var(--color-accent)" : "transparent", color: tab === key ? "var(--color-bg)" : "inherit" }}
            >
              {label}
            </button>
          ))}
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
              <div key={p._id} role="button" tabIndex={0} className="card elev-sm card-clickable" onClick={() => router.push(`/projects/${p._id}`)} onKeyDown={onKeyActivate(() => router.push(`/projects/${p._id}`))}>
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

      {tab === "chat" && (
        <div className="page-pad" style={{ padding: "0 40px 40px", display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
          <div ref={chatContainerRef} onScroll={onChatScroll} style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10, padding: "6px 0" }}>
            {messages.length === 0 && <div className="card-meta">No messages yet. Say hello.</div>}
            {messages.map((m, idx) => {
              const unreadCount = initialUnreadRef.current ?? 0;
              const unreadStartIndex = unreadCount > 0 ? Math.max(0, messages.length - unreadCount) : -1;
              const isUnreadStart = idx === unreadStartIndex;

              const senderId = typeof m.senderId === "string" ? m.senderId : m.senderId._id;
              const senderName = typeof m.senderId === "string" ? "" : m.senderId.name;
              const senderAvatar = typeof m.senderId === "string" ? null : m.senderId.avatarUrl;
              const mine = senderId === session?.user?.id;
              const iAmMentioned = !mine && m.mentions.some((mn) => mn._id === session?.user?.id);
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
                  {m.isSystemMessage ? (
                    <div style={{ textAlign: "center", fontSize: 12, color: "color-mix(in srgb, var(--color-text) 45%, transparent)" }}>
                      {m.text}
                    </div>
                  ) : (
                    <div className="row-hover tf-msg-in" style={{ display: "flex", gap: 8, alignSelf: mine ? "flex-end" : "flex-start", flexDirection: mine ? "row-reverse" : "row", maxWidth: "58%" }}>
                      {!mine && <Avatar name={senderName} avatarUrl={senderAvatar} size={26} />}
                      <div style={{ display: "flex", flexDirection: "column", alignItems: mine ? "flex-end" : "flex-start" }}>
                        <div style={{ fontSize: 11, color: "color-mix(in srgb, var(--color-text) 55%, transparent)", marginBottom: 3, padding: "0 2px" }}>
                          {senderName} · {new Date(m.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                        </div>
                        <div style={{ display: "flex", gap: 4, alignItems: "flex-end", flexDirection: mine ? "row-reverse" : "row" }}>
                          <div
                            style={{
                              padding: "9px 13px",
                              borderRadius: 14,
                              fontSize: 14,
                              lineHeight: 1.4,
                              background: mine ? "var(--color-accent)" : iAmMentioned ? "var(--color-amber-bg)" : "var(--color-surface)",
                              color: mine ? "var(--color-bg)" : "var(--color-text)",
                              border: iAmMentioned ? "1px solid var(--color-amber)" : "1px solid transparent",
                            }}
                          >
                            {m.replyTo && (
                              <div style={{ borderLeft: "2px solid currentColor", background: "color-mix(in srgb, currentColor 14%, transparent)", borderRadius: 6, padding: "4px 8px", marginBottom: 6, fontSize: 12.5 }}>
                                <div style={{ fontWeight: 600, opacity: 0.9 }}>{m.replyTo.senderName}</div>
                                <div style={{ opacity: 0.75, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 220 }}>{m.replyTo.text}</div>
                              </div>
                            )}
                            {m.attachments?.map((a, i) => <div key={i} style={{ marginBottom: m.text ? 6 : 0 }}><AttachmentView attachment={a} mine={mine} /></div>)}
                            {m.text && renderWithMentions(m.text, m.mentions, mine)}
                          </div>
                          <button
                            onClick={() => setReplyingTo({ _id: m._id, text: m.text || "📎 Attachment", senderName })}
                            title="Reply"
                            aria-label={`Reply to ${senderName}`}
                            style={{ background: "none", border: "none", cursor: "pointer", padding: 4, opacity: 0.55, flex: "none" }}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 17l-5-5 5-5M4 12h10a5 5 0 015 5v2" /></svg>
                          </button>
                        </div>
                        {mine && m.readBy.length > 0 && (
                          <button
                            onClick={() => setSeenByModal(m.readBy)}
                            style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 2px 0", fontSize: 11, color: "color-mix(in srgb, var(--color-text) 50%, transparent)" }}
                          >
                            Seen by {m.readBy.length}
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            <div ref={chatEndRef} />
          </div>
          {typingUsers.length > 0 && (
            <div style={{ fontSize: 12, fontStyle: "italic", color: "color-mix(in srgb, var(--color-text) 50%, transparent)", padding: "2px 4px" }}>
              {typingUsers.map((t) => t.name).join(", ")} {typingUsers.length === 1 ? "is" : "are"} typing…
            </div>
          )}
          {replyingTo && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", marginTop: 10, background: "var(--color-bg)", borderRadius: 8 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent-300)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flex: "none" }}><path d="M9 17l-5-5 5-5M4 12h10a5 5 0 015 5v2" /></svg>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11.5, fontWeight: 600, color: "var(--color-accent-300)" }}>{replyingTo.senderName}</div>
                <div style={{ fontSize: 12, opacity: 0.7, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{replyingTo.text}</div>
              </div>
              <button className="btn btn-icon" onClick={() => setReplyingTo(null)} aria-label="Cancel reply" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, opacity: 0.6 }}>×</button>
            </div>
          )}
          <div style={{ display: "flex", gap: 8, marginTop: 10, position: "relative" }}>
            {mentionQuery !== null && (
              <div className="card elev-sm" style={{ position: "absolute", bottom: "100%", left: 0, marginBottom: 6, width: 220, padding: 6, gap: 2, zIndex: 20 }}>
                {members
                  ?.filter((m) => m.userId._id !== session?.user?.id && m.userId.name.toLowerCase().startsWith(mentionQuery.toLowerCase()))
                  .slice(0, 5)
                  .map((m) => (
                    <div
                      key={m.userId._id}
                      role="option"
                      aria-selected={false}
                      tabIndex={0}
                      className="row-hover"
                      onClick={() => pickMention(m.userId.name, m.userId._id)}
                      onKeyDown={onKeyActivate(() => pickMention(m.userId.name, m.userId._id))}
                      style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 6, cursor: "pointer", fontSize: 13 }}
                    >
                      <Avatar name={m.userId.name} avatarUrl={m.userId.avatarUrl} size={20} fontSize={9.5} />
                      {m.userId.name}
                    </div>
                  ))}
              </div>
            )}
            <input ref={fileInputRef} type="file" onChange={onFilePicked} style={{ display: "none" }} />
            <button type="button" className="btn btn-secondary btn-icon" disabled={sendingAttachment || voice.recording} onClick={() => fileInputRef.current?.click()} title="Attach a file" aria-label="Attach a file">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" /></svg>
            </button>
            <input
              className="input"
              placeholder={voice.recording ? "Recording… Tap mic to stop" : `Message ${group?.name ?? "group"}… (@ to mention)`}
              value={composer}
              disabled={voice.recording}
              onChange={(e) => onComposerChange(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); sendMessage(); } }}
              autoComplete="off"
              style={{ flex: 1 }}
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
              <button className="btn btn-primary btn-icon" type="button" onClick={sendMessage} aria-label="Send message">
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
          {sendingAttachment && <div className="card-meta" style={{ marginTop: 4 }}>Uploading…</div>}
          {voice.error && <div style={{ color: "oklch(70% 0.15 25)", fontSize: 12, marginTop: 4 }}>{voice.error}</div>}
        </div>
      )}

      {tab === "members" && (
        <div className="page-pad" style={{ padding: "0 40px 40px" }}>
          <div className="table-wrap">
          <table className="table responsive-table">
            <thead><tr><th>Name</th><th>Role</th><th></th></tr></thead>
            <tbody>
              {members?.map((m) => {
                const isMe = m.userId._id === session?.user?.id;
                return (
                  <tr key={m._id} className="row-hover" style={{ cursor: "default" }}>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div
                          role={isMe ? undefined : "button"}
                          tabIndex={isMe ? undefined : 0}
                          onClick={() => !isMe && messageMember(m.userId._id)}
                          onKeyDown={isMe ? undefined : onKeyActivate(() => messageMember(m.userId._id))}
                          style={{ cursor: isMe ? "default" : "pointer" }}
                          title={isMe ? undefined : "Message"}
                          aria-label={isMe ? undefined : `Message ${m.userId.name}`}
                        >
                          <Avatar name={m.userId.name} avatarUrl={m.userId.avatarUrl} size={28} online={isOnline(m.userId.lastActiveAt)} />
                        </div>
                        <div>
                          <div>{m.userId.name}</div>
                          <div style={{ fontSize: 11.5, color: "color-mix(in srgb, var(--color-text) 50%, transparent)" }}>{m.userId.email}</div>
                          <div style={{ fontSize: 11 }}>
                            {isOnline(m.userId.lastActiveAt) ? <span style={{ color: "var(--color-green)" }}>Online</span> : <span style={{ color: "color-mix(in srgb, var(--color-text) 45%, transparent)" }}>{formatLastSeen(m.userId.lastActiveAt)}</span>}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span className={m.role === "admin" ? "tag tag-accent" : "tag tag-neutral"}>{m.role}</span>
                        {m.role === "admin" && m.canDeleteGroup && (
                          <span className="tag" style={{ background: "color-mix(in srgb, var(--color-accent) 15%, transparent)", color: "var(--color-accent-300)" }}>
                            Can delete
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", flexWrap: "wrap" }}>
                        {isOrgAccount && m.role === "admin" && !isMe && (
                          <button
                            className="btn btn-secondary"
                            style={{ padding: "4px 8px", fontSize: 12 }}
                            onClick={() => toggleDeletePerm(m.userId._id, !m.canDeleteGroup)}
                            title={m.canDeleteGroup ? "Revoke group deletion permission" : "Allow admin to delete this group"}
                          >
                            {m.canDeleteGroup ? "Revoke delete" : "Allow delete"}
                          </button>
                        )}
                        {isAdmin && !isMe && (
                          <>
                            <button className="btn btn-secondary" style={{ padding: "4px 10px", fontSize: 12 }} onClick={() => setRole(m.userId._id, m.role === "admin" ? "member" : "admin")}>
                              {m.role === "admin" ? "Demote" : "Promote"}
                            </button>
                            <button className="btn btn-secondary" style={{ padding: "4px 10px", fontSize: 12, color: "var(--color-accent-300)" }} onClick={() => setConfirmRemove(m)}>
                              Remove
                            </button>
                          </>
                        )}
                        {!isMe && (
                          <button className="btn btn-secondary" style={{ padding: "4px 10px", fontSize: 12 }} onClick={() => messageMember(m.userId._id)}>
                            Message
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
          {!isAdmin && <div style={{ fontSize: 12.5, color: "color-mix(in srgb, var(--color-text) 50%, transparent)", marginTop: 12 }}>Only admins can manage members.</div>}
        </div>
      )}

      {tab === "activity" && isAdmin && (
        <div className="page-pad" style={{ padding: "0 40px 40px" }}>
          {activity?.length === 0 && <div className="card-meta">No activity yet.</div>}
          <div className="card elev-sm" style={{ gap: 0 }}>
            {activity?.map((a) => (
              <div key={a._id} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "10px 12px", margin: "0 -12px", borderBottom: "1px solid var(--color-divider)" }}>
                <span style={{ fontSize: 13.5 }}>{a.meta.text}</span>
                <span className="mono" style={{ fontSize: 11, opacity: 0.6, flex: "none" }}>{new Date(a.createdAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {seenByModal && (
        <div
          onClick={() => setSeenByModal(null)}
          onKeyDown={(e) => { if (e.key === "Escape") setSeenByModal(null); }}
          role="presentation"
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 }}
        >
          <div onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Seen by" className="card elev-sm" style={{ width: 320, maxWidth: "100%", maxHeight: "70vh", overflowY: "auto" }}>
            <div className="card-title">Seen by</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {seenByModal.map((r) => (
                <div key={r.userId._id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Avatar name={r.userId.name} avatarUrl={r.userId.avatarUrl} size={28} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13.5 }}>{r.userId.name}</div>
                    <div style={{ fontSize: 11, color: "color-mix(in srgb, var(--color-text) 50%, transparent)" }}>
                      {new Date(r.readAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <button ref={seenByCloseRef} className="btn btn-secondary btn-block" onClick={() => setSeenByModal(null)}>Close</button>
          </div>
        </div>
      )}

      {confirmRemove && (
        <ConfirmDialog
          title="Remove member"
          description={`${confirmRemove.userId.name} will lose access to this group and its tasks immediately. They'll need a new invite to rejoin.`}
          confirmLabel="Remove"
          danger
          onConfirm={() => removeMember(confirmRemove)}
          onCancel={() => setConfirmRemove(null)}
        />
      )}

      {confirmLeave && (
        <ConfirmDialog
          title="Leave group"
          description={`You'll lose access to ${group?.name ?? "this group"} and its tasks. You'll need a new invite to rejoin.`}
          confirmLabel="Leave"
          danger
          onConfirm={leaveGroup}
          onCancel={() => setConfirmLeave(false)}
        />
      )}

      {confirmDeleteGroup && (
        <ConfirmDialog
          title="Delete group"
          description={`"${group?.name ?? "This group"}" and all its projects, tasks, and messages will be permanently deleted. This can't be undone.`}
          confirmLabel="Delete group"
          danger
          onConfirm={deleteGroup}
          onCancel={() => setConfirmDeleteGroup(false)}
        />
      )}
    </div>
  );
}
