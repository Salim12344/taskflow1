"use client";

import { useEffect, useRef, useState, use as usePromise } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { api, uploadFile, type Attachment } from "@/lib/api-client";
import { Avatar } from "@/components/Avatar";
import { AttachmentView, VoiceMessage } from "@/components/AttachmentView";
import { useVoiceRecorder } from "@/lib/use-voice-recorder";
import { isOnline, formatLastSeen } from "@/lib/presence";
import { onKeyActivate } from "@/lib/a11y";
import { useStickToBottom } from "@/lib/use-stick-to-bottom";
import { ErrorBanner } from "@/components/ErrorBanner";

type ReplyTo = { messageId: string; text: string; senderName: string };
type Message = { _id: string; text: string; senderId: string; createdAt: string; readAt: string | null; replyTo: ReplyTo | null; attachments: Attachment[] };
type Thread = { threadId: string; other: { id: string; name: string; avatarUrl: string | null; lastActiveAt: string | null } | null };

export default function DmThreadPage({ params }: { params: Promise<{ threadId: string }> }) {
  const { threadId } = usePromise(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();

  const [messages, setMessages] = useState<Message[]>([]);
  const [otherName, setOtherName] = useState<string | null>(null);
  const [otherAvatar, setOtherAvatar] = useState<string | null>(null);
  const [otherLastActive, setOtherLastActive] = useState<string | null>(null);
  const [composer, setComposer] = useState("");
  const [otherTyping, setOtherTyping] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [replyingTo, setReplyingTo] = useState<{ _id: string; text: string } | null>(null);
  const [sendingAttachment, setSendingAttachment] = useState(false);
  const [pendingVoiceBlob, setPendingVoiceBlob] = useState<Blob | null>(null);
  const [pendingVoiceUrl, setPendingVoiceUrl] = useState<string | null>(null);
  const voice = useVoiceRecorder();
  const initialUnreadRef = useRef<number | null>(null);
  const dividerRef = useRef<HTMLDivElement>(null);
  const scrolledToUnreadRef = useRef(false);
  const hasUnread = (initialUnreadRef.current ?? 0) > 0;
  const { containerRef: chatContainerRef, endRef, onScroll: onChatScroll } = useStickToBottom(messages, { skipInitialScroll: hasUnread });
  const lastTypingPingRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function loadMessages() {
    api<{ messages: Message[]; otherTyping: boolean; unreadCount: number }>(`/api/dm/${threadId}/messages`)
      .then((d) => {
        setMessages(d.messages);
        setOtherTyping(d.otherTyping);
        setError(null);
        if (initialUnreadRef.current === null) initialUnreadRef.current = d.unreadCount;
      })
      .catch((e) => setError(e));
  }

  useEffect(() => {
    if (scrolledToUnreadRef.current) return;
    if (initialUnreadRef.current === null || initialUnreadRef.current === 0) return;
    if (messages.length === 0) return;
    scrolledToUnreadRef.current = true;
    requestAnimationFrame(() => dividerRef.current?.scrollIntoView({ block: "start", behavior: "instant" }));
  }, [messages.length]);

  function onComposerChange(value: string) {
    setComposer(value);
    const now = Date.now();
    if (now - lastTypingPingRef.current > 2500) {
      lastTypingPingRef.current = now;
      api(`/api/dm/${threadId}/typing`, { method: "POST" }).catch(() => {});
    }
  }

  function loadOther() {
    api<{ threads: Thread[] }>("/api/dm")
      .then((d) => {
        const other = d.threads.find((t) => t.threadId === threadId)?.other;
        setOtherName(other?.name ?? null);
        setOtherAvatar(other?.avatarUrl ?? null);
        setOtherLastActive(other?.lastActiveAt ?? null);
      })
      .catch(() => {});
  }

  useEffect(() => {
    loadMessages();
    loadOther();
    const interval = setInterval(() => { loadMessages(); loadOther(); }, 1500);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId]);

  async function sendMessage() {
    if (!composer.trim()) return;
    const text = composer;
    const reply = replyingTo;
    setComposer("");
    setReplyingTo(null);
    try {
      await api(`/api/dm/${threadId}/messages`, { method: "POST", body: JSON.stringify({ text, replyToId: reply?._id }) });
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
      await api(`/api/dm/${threadId}/messages`, { method: "POST", body: JSON.stringify({ text: "", attachments: [attachment], replyToId: reply?._id }) });
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
      if (blob && blob.size > 0) {
        // Save the recorded blob so the user can preview before sending.
        const url = URL.createObjectURL(blob);
        setPendingVoiceBlob(blob);
        setPendingVoiceUrl(url);
      }
    } else {
      // If there's an existing pending voice note, discard it before recording again.
      if (pendingVoiceUrl) {
        try { URL.revokeObjectURL(pendingVoiceUrl); } catch {}
        setPendingVoiceBlob(null);
        setPendingVoiceUrl(null);
      }
      await voice.start();
    }
  }

  async function sendPendingVoice() {
    if (!pendingVoiceBlob) return;
    try {
      await sendAttachment(pendingVoiceBlob, `voice-note.${pendingVoiceBlob.type.includes("mp4") ? "m4a" : "webm"}`);
    } finally {
      if (pendingVoiceUrl) {
        try { URL.revokeObjectURL(pendingVoiceUrl); } catch {}
      }
      setPendingVoiceBlob(null);
      setPendingVoiceUrl(null);
    }
  }

  function discardPendingVoice() {
    if (pendingVoiceUrl) {
      try { URL.revokeObjectURL(pendingVoiceUrl); } catch {}
    }
    setPendingVoiceBlob(null);
    setPendingVoiceUrl(null);
  }

  function onFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) sendAttachment(file, file.name);
  }

  const from = searchParams.get("from");
  const backTarget = from?.startsWith("group:") ? `/groups/${from.split(":")[1]}` : "/messages";
  const backLabel = from?.startsWith("group:") ? "Back to group" : "Messages";

  return (
    <div className="tf-fade page-pad" style={{ display: "flex", flexDirection: "column", height: "100%", padding: "24px 40px", minHeight: 0 }}>
      <div role="link" tabIndex={0} onClick={() => router.push(backTarget)} onKeyDown={onKeyActivate(() => router.push(backTarget))} className="back-link" style={{ marginBottom: 14 }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        {backLabel}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
        <Avatar name={otherName ?? "?"} avatarUrl={otherAvatar} size={32} fontSize={12} online={isOnline(otherLastActive)} />
        <div>
          <div style={{ fontFamily: "var(--font-heading)", fontWeight: 600, fontSize: 15 }}>{otherName ?? "…"}</div>
          <div style={{ fontSize: 11.5, color: isOnline(otherLastActive) ? "var(--color-green)" : "color-mix(in srgb, var(--color-text) 50%, transparent)", fontStyle: otherTyping ? "italic" : "normal" }}>
            {otherTyping ? "typing…" : formatLastSeen(otherLastActive)}
          </div>
        </div>
      </div>
      <ErrorBanner error={error} onRetry={loadMessages} />

      <div ref={chatContainerRef} onScroll={onChatScroll} style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
        {messages.length === 0 && <div className="card-meta">No messages yet. Say hello.</div>}
        {messages.map((m, i) => {
          const unreadCount = initialUnreadRef.current ?? 0;
          const unreadStartIndex = unreadCount > 0 ? Math.max(0, messages.length - unreadCount) : -1;
          const isUnreadStart = i === unreadStartIndex;
          const mine = m.senderId === session?.user?.id;
          const isLastMine = mine && i === messages.length - 1;
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
              <div className="row-hover tf-msg-in" style={{ display: "flex", flexDirection: "column", alignItems: mine ? "flex-end" : "flex-start", maxWidth: "55%", alignSelf: mine ? "flex-end" : "flex-start" }}>
              <div style={{ fontSize: 11, color: "color-mix(in srgb, var(--color-text) 55%, transparent)", marginBottom: 3, padding: "0 2px" }}>
                {new Date(m.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
              </div>
              <div style={{ display: "flex", gap: 4, alignItems: "flex-end", flexDirection: mine ? "row-reverse" : "row" }}>
                <div style={{ padding: "9px 13px", borderRadius: 14, fontSize: 14, lineHeight: 1.4, background: mine ? "var(--color-accent)" : "var(--color-surface)", color: mine ? "var(--color-bg)" : "var(--color-text)" }}>
                  {m.replyTo && (
                    <div style={{ borderLeft: "2px solid currentColor", background: "color-mix(in srgb, currentColor 14%, transparent)", borderRadius: 6, padding: "4px 8px", marginBottom: 6, fontSize: 12.5 }}>
                      <div style={{ fontWeight: 600, opacity: 0.9 }}>{m.replyTo.senderName}</div>
                      <div style={{ opacity: 0.75, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 220 }}>{m.replyTo.text}</div>
                    </div>
                  )}
                  {m.attachments?.map((a, i) => <div key={i} style={{ marginBottom: m.text ? 6 : 0 }}><AttachmentView attachment={a} mine={mine} /></div>)}
                  {m.text}
                </div>
                <button
                  onClick={() => setReplyingTo({ _id: m._id, text: m.text || "📎 Attachment" })}
                  title="Reply"
                  aria-label={mine ? "Reply to your message" : `Reply to ${otherName ?? "message"}`}
                  style={{ background: "none", border: "none", cursor: "pointer", padding: 4, opacity: 0.55, flex: "none" }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 17l-5-5 5-5M4 12h10a5 5 0 015 5v2" /></svg>
                </button>
              </div>
              {isLastMine && (
                <div style={{ fontSize: 11, color: "color-mix(in srgb, var(--color-text) 45%, transparent)", marginTop: 2, padding: "0 2px" }}>
                  {m.readAt ? `Seen ${new Date(m.readAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : "Delivered"}
                </div>
              )}
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      {replyingTo && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", marginTop: 12, background: "var(--color-bg)", borderRadius: 8 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent-300)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flex: "none" }}><path d="M9 17l-5-5 5-5M4 12h10a5 5 0 015 5v2" /></svg>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11.5, fontWeight: 600, color: "var(--color-accent-300)" }}>{replyingTo._id && messages.find((m) => m._id === replyingTo._id)?.senderId === session?.user?.id ? "yourself" : otherName}</div>
            <div style={{ fontSize: 12, opacity: 0.7, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{replyingTo.text}</div>
          </div>
          <button className="btn btn-icon" onClick={() => setReplyingTo(null)} aria-label="Cancel reply" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, opacity: 0.6 }}>×</button>
        </div>
      )}
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <input ref={fileInputRef} type="file" onChange={onFilePicked} style={{ display: "none" }} />
        <button type="button" className="btn btn-secondary btn-icon" disabled={sendingAttachment || voice.recording} onClick={() => fileInputRef.current?.click()} title="Attach a file" aria-label="Attach a file">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" /></svg>
        </button>
        <input
          className="input"
          placeholder={voice.recording ? "Recording… Tap mic to stop" : `Message ${otherName ?? ""}…`}
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
            title={voice.recording ? "Tap to stop recording" : "Tap to record voice note"}
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
      {pendingVoiceUrl && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8, padding: "8px 12px", background: "var(--color-surface, rgba(255,255,255,0.05))", borderRadius: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <VoiceMessage src={pendingVoiceUrl} mine={false} />
          </div>
          <button className="btn btn-primary" onClick={sendPendingVoice} style={{ whiteSpace: "nowrap" }}>Send</button>
          <button className="btn" onClick={discardPendingVoice}>Discard</button>
        </div>
      )}
    </div>
  );
}
