"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api-client";
import { resizeImageToDataUrl } from "@/lib/image";
import { Avatar } from "@/components/Avatar";
import { ErrorBanner } from "@/components/ErrorBanner";
import { usePush } from "@/lib/use-push";

type Me = { name: string; email: string; accountType: string; avatarUrl: string | null; showOnlineStatus: boolean };

const PERSONAL_PREFS = [
  "Task assigned or reassigned to you",
  "Task approved or rejected",
  "New @mention in a group",
  "New direct message",
  "New group message",
  "New message in task chat",
];

// Org owners are auto-admin on every group their org creates — this notification never
// applies to them there, so it'd be a dead checkbox for the account type it matters least for.
const GROUP_JOINED_PREF = "Added to a group";

const ADMIN_ONLY_PREFS = [
  "Task submitted for review",
];

export default function SettingsPage() {
  const push = usePush();
  const [me, setMe] = useState<Me | null>(null);
  const [isAdminAnywhere, setIsAdminAnywhere] = useState(false);
  const [name, setName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [showOnlineStatus, setShowOnlineStatus] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [saved, setSaved] = useState(false);
  const [prefs, setPrefs] = useState<boolean[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api<{ user: Me; isAdminAnywhere: boolean }>("/api/me")
      .then((d) => {
        setMe(d.user);
        setName(d.user.name);
        setAvatarUrl(d.user.avatarUrl);
        setShowOnlineStatus(d.user.showOnlineStatus);
        setIsAdminAnywhere(d.isAdminAnywhere);
        const base = d.user.accountType === "organization" ? PERSONAL_PREFS : [GROUP_JOINED_PREF, ...PERSONAL_PREFS];
        const visiblePrefs = d.isAdminAnywhere ? [...base, ...ADMIN_ONLY_PREFS] : base;
        setPrefs(visiblePrefs.map(() => true));
      })
      .catch((e) => setError(e));
  }, []);

  const base = me?.accountType === "organization" ? PERSONAL_PREFS : [GROUP_JOINED_PREF, ...PERSONAL_PREFS];
  const visiblePrefs = isAdminAnywhere ? [...base, ...ADMIN_ONLY_PREFS] : base;

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    try {
      const dataUrl = await resizeImageToDataUrl(file);
      setAvatarUrl(dataUrl);
    } catch (err) {
      setError(err);
    }
  }

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await api("/api/me", { method: "PATCH", body: JSON.stringify({ name, avatarUrl, showOnlineStatus }) });
      setSaved(true);
      setTimeout(() => setSaved(false), 5000);
      window.dispatchEvent(new Event("taskflow:profile-changed"));
    } catch (e) {
      setError(e);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="tf-fade page-pad" style={{ padding: "32px 40px 40px" }}>
      <h2 style={{ marginBottom: 20 }}>Settings</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 20 }}>
        <div className="card elev-sm">
          <div className="card-title">Profile</div>

          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <Avatar name={name || "?"} avatarUrl={avatarUrl} size={72} />
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <button type="button" className="btn btn-secondary" onClick={() => fileRef.current?.click()}>
                Change photo
              </button>
              {avatarUrl && (
                <button type="button" className="btn btn-secondary" style={{ color: "var(--color-accent-300)" }} onClick={() => setAvatarUrl(null)}>
                  Remove photo
                </button>
              )}
              <input ref={fileRef} type="file" accept="image/*" onChange={onPickFile} style={{ display: "none" }} />
            </div>
          </div>

          <div className="field">
            <label>Name</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field">
            <label>Email</label>
            <input className="input" value={me?.email ?? ""} readOnly />
          </div>
          <div className="field">
            <label>Account type</label>
            <input className="input" readOnly value={me?.accountType === "organization" ? "Organization" : "Individual"} />
          </div>

          <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderTop: "1px solid var(--color-divider)", cursor: "pointer" }}>
            <div>
              <div style={{ fontSize: 13 }}>Show my online status</div>
              <div style={{ fontSize: 11.5, color: "color-mix(in srgb, var(--color-text) 55%, transparent)" }}>Lets others see when you're online or your last-seen time. Applies everywhere — DMs, group members, everyone.</div>
            </div>
            <input
              type="checkbox"
              checked={showOnlineStatus}
              onChange={(e) => setShowOnlineStatus(e.target.checked)}
              style={{ width: "auto", accentColor: "var(--color-accent)", flex: "none" }}
            />
          </label>

          <ErrorBanner error={error} />
          {saved && <div style={{ color: "var(--color-accent-300)", fontSize: 12.5 }}>Saved.</div>}

          <button className="btn btn-primary" style={{ width: "fit-content" }} disabled={saving} onClick={save}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>

        <div className="card elev-sm">
          <div className="card-title">Push notifications</div>
          {push.supported ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", cursor: "pointer" }}>
                <div>
                  <div style={{ fontSize: 13 }}>Notify this device</div>
                  <div style={{ fontSize: 11.5, color: "color-mix(in srgb, var(--color-text) 55%, transparent)" }}>
                    Get a notification here even when TaskFlow isn&rsquo;t open — assignments, reviews, mentions, and messages.
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={push.subscribed}
                  disabled={push.loading}
                  onChange={(e) => (e.target.checked ? push.subscribe() : push.unsubscribe())}
                  style={{ width: "auto", accentColor: "var(--color-accent)", flex: "none" }}
                />
              </label>

              {push.error && (
                <div style={{ color: "oklch(70% 0.15 25)", fontSize: 12, lineHeight: 1.4 }}>
                  {push.error}
                </div>
              )}

              {push.subscribed && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: "1px solid var(--color-divider)", paddingTop: 10 }}>
                  <div style={{ fontSize: 12, color: "var(--color-accent-300)" }}>Push notifications active on this device.</div>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ fontSize: 12, padding: "4px 10px" }}
                    onClick={() => push.sendTest()}
                  >
                    Send test push
                  </button>
                </div>
              )}
            </div>
          ) : push.isIOS && !push.isStandalone ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "6px 0" }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-accent-300)" }}>
                Enable Push on iPhone / iPad:
              </div>
              <div style={{ fontSize: 12, lineHeight: 1.5, color: "color-mix(in srgb, var(--color-text) 70%, transparent)" }}>
                iOS requires web apps to be installed to the Home Screen for push notifications:
              </div>
              <ol style={{ fontSize: 12, lineHeight: 1.6, paddingLeft: 18, color: "color-mix(in srgb, var(--color-text) 75%, transparent)" }}>
                <li>Tap the <strong>Share</strong> button in Safari (<span style={{ fontSize: 14 }}>⎕↑</span>).</li>
                <li>Select <strong>&ldquo;Add to Home Screen&rdquo;</strong>.</li>
                <li>Open TaskFlow from your Home Screen, return to Settings, and enable notifications here.</li>
              </ol>
            </div>
          ) : (
            <div className="card-meta">Push notifications aren&rsquo;t supported in this browser.</div>
          )}
        </div>

        <div className="card elev-sm">
          <div className="card-title">Notifications</div>
          {visiblePrefs.map((label, i) => (
            <label key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--color-divider)", cursor: "pointer" }}>
              <span style={{ fontSize: 13 }}>{label}</span>
              <input
                type="checkbox"
                checked={prefs[i] ?? true}
                onChange={() => setPrefs((p) => p.map((v, idx) => (idx === i ? !v : v)))}
                style={{ width: "auto", accentColor: "var(--color-accent)" }}
              />
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
