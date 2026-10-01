"use client";

import { useEffect, useRef, useState } from "react";
import type { Attachment } from "@/lib/api-client";

// In-memory cache for audio durations so we never re-decode or re-fetch known audio URLs
const durationCache = new Map<string, number>();
const inflightDecodes = new Map<string, Promise<number>>();

// Track currently playing audio element so playing one voice note pauses any other
let activeAudioElement: HTMLAudioElement | null = null;

/**
 * Resolves the true duration of an audio file in seconds.
 * Fixes the Chromium WebM MediaRecorder bug where audio.duration evaluates to Infinity or NaN.
 */
export async function resolveAudioDuration(url: string): Promise<number> {
  if (durationCache.has(url)) return durationCache.get(url)!;
  if (inflightDecodes.has(url)) return inflightDecodes.get(url)!;

  const promise = (async () => {
    try {
      const res = await fetch(url);
      if (!res.ok) return 0;
      const arrayBuffer = await res.arrayBuffer();

      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

      if (AudioCtx) {
        const ctx = new AudioCtx();
        try {
          const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
          const d = audioBuffer.duration;
          if (Number.isFinite(d) && d > 0) {
            durationCache.set(url, d);
            return d;
          }
        } finally {
          ctx.close().catch(() => {});
        }
      }
    } catch {
      // Decode fallback continues to audio element
    } finally {
      inflightDecodes.delete(url);
    }
    return 0;
  })();

  inflightDecodes.set(url, promise);
  return promise;
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  const total = Math.round(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** WhatsApp-style voice-note player — native <audio controls> renders as a browser-chrome
 * widget that can't be recolored to sit inside a chat bubble, hence the custom transport. */
export function VoiceMessage({ src, mine = false }: { src: string; mine?: boolean }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState<number>(() => durationCache.get(src) ?? 0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    let unmounted = false;

    // 1. Check cache immediately
    const cached = durationCache.get(src);
    if (cached && cached > 0) {
      setDuration(cached);
    } else {
      // 2. Decode accurate duration in parallel
      resolveAudioDuration(src).then((d) => {
        if (!unmounted && d > 0) {
          setDuration(d);
        }
      });
    }

    // 3. Audio element metadata & Chromium WebM Infinity workaround
    const updateFromAudio = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        durationCache.set(src, audio.duration);
        if (!unmounted) setDuration(audio.duration);
        return;
      }

      // Chromium WebM MediaRecorder bug: audio.duration === Infinity
      // Seeking to an extremely high number forces Chrome to parse the file to EOF and calculate duration
      if (audio.duration === Infinity) {
        const onSeeked = () => {
          audio.removeEventListener("seeked", onSeeked);
          audio.currentTime = 0;
          if (Number.isFinite(audio.duration) && audio.duration > 0) {
            durationCache.set(src, audio.duration);
            if (!unmounted) setDuration(audio.duration);
          }
        };
        audio.addEventListener("seeked", onSeeked, { once: true });
        audio.currentTime = 1e101;
      }
    };

    const onTime = () => setProgress(audio.currentTime);
    const onPlay = () => {
      // Pause any previously active audio element
      if (activeAudioElement && activeAudioElement !== audio) {
        try {
          activeAudioElement.pause();
        } catch {}
      }
      activeAudioElement = audio;
      setPlaying(true);
    };
    const onPause = () => {
      if (activeAudioElement === audio) {
        activeAudioElement = null;
      }
      setPlaying(false);
    };
    const onEnd = () => {
      if (activeAudioElement === audio) {
        activeAudioElement = null;
      }
      setPlaying(false);
      setProgress(0);
    };

    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", updateFromAudio);
    audio.addEventListener("durationchange", updateFromAudio);
    audio.addEventListener("canplaythrough", updateFromAudio);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnd);

    if (audio.readyState >= 1) {
      updateFromAudio();
    }

    return () => {
      unmounted = true;
      if (activeAudioElement === audio) {
        activeAudioElement = null;
      }
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", updateFromAudio);
      audio.removeEventListener("durationchange", updateFromAudio);
      audio.removeEventListener("canplaythrough", updateFromAudio);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnd);
    };
  }, [src]);

  function toggle() {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
    } else {
      if (audio.ended || (duration > 0 && Math.abs(audio.currentTime - duration) < 0.2)) {
        audio.currentTime = 0;
        setProgress(0);
      }
      audio.play().catch((err) => {
        console.error("Audio playback error:", err);
      });
    }
  }

  function handleScrub(e: React.MouseEvent<HTMLDivElement>) {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const target = ratio * duration;
    audio.currentTime = target;
    setProgress(target);
  }

  const fg = mine ? "var(--color-bg)" : "var(--color-text)";
  const track = mine
    ? "color-mix(in srgb, var(--color-bg) 35%, transparent)"
    : "color-mix(in srgb, var(--color-text) 20%, transparent)";
  const pct = duration > 0 ? Math.min(100, (progress / duration) * 100) : 0;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 180, color: fg }}>
      <audio ref={audioRef} src={src} preload="metadata" style={{ display: "none" }} />
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? "Pause voice message" : "Play voice message"}
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: 0,
          color: fg,
          flex: "none",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {playing ? (
          <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="5" width="4" height="14" rx="1" />
            <rect x="14" y="5" width="4" height="14" rx="1" />
          </svg>
        ) : (
          <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5v14l11-7z" />
          </svg>
        )}
      </button>

      {/* Interactive scrubber bar with larger hit target */}
      <div
        role="slider"
        aria-valuenow={progress}
        aria-valuemin={0}
        aria-valuemax={duration}
        onClick={handleScrub}
        style={{
          flex: 1,
          height: 16,
          display: "flex",
          alignItems: "center",
          cursor: duration > 0 ? "pointer" : "default",
          position: "relative",
        }}
      >
        <div style={{ width: "100%", height: 3, borderRadius: 2, background: track, position: "relative" }}>
          <div style={{ position: "absolute", inset: 0, width: `${pct}%`, borderRadius: 2, background: fg }} />
          {(playing || progress > 0) && (
            <div
              style={{
                position: "absolute",
                top: "50%",
                left: `${pct}%`,
                transform: "translate(-50%, -50%)",
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: fg,
              }}
            />
          )}
        </div>
      </div>

      <div
        className="mono"
        style={{
          fontSize: 10.5,
          opacity: 0.85,
          flex: "none",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {formatDuration(playing || progress > 0 ? progress : duration)}
      </div>
    </div>
  );
}

export function AttachmentView({ attachment, mine }: { attachment: Attachment; mine: boolean }) {
  if (attachment.type.startsWith("audio/")) {
    return <VoiceMessage src={attachment.url} mine={mine} />;
  }

  if (attachment.type.startsWith("image/")) {
    return (
      <a href={attachment.url} target="_blank" rel="noopener noreferrer">
        <img src={attachment.url} alt={attachment.name} style={{ display: "block", maxWidth: 220, maxHeight: 220, borderRadius: 8, objectFit: "cover" }} />
      </a>
    );
  }

  return (
    <a
      href={attachment.url}
      target="_blank"
      rel="noopener noreferrer"
      style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 8, background: "rgba(0,0,0,0.12)", color: "inherit", textDecoration: "none", maxWidth: 220 }}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flex: "none" }}>
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
        <path d="M14 2v6h6" />
      </svg>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{attachment.name}</div>
        <div style={{ fontSize: 10.5, opacity: 0.7 }}>{formatSize(attachment.size)}</div>
      </div>
    </a>
  );
}
