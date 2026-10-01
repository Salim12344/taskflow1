"use client";

import { useEffect, useRef } from "react";

/** Auto-scrolls a chat to the newest message only if the user was already near the bottom —
 *  polling shouldn't yank someone back down while they're reading older messages.
 *
 *  Pass skipInitialScroll=true when there are unread messages and you want to scroll to an
 *  unread divider instead of jumping straight to the bottom on first load. */
export function useStickToBottom<T>(items: T[], opts?: { skipInitialScroll?: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  // When there are unread messages the caller will scroll to the divider, so we start "not
  // near bottom" to suppress the hook's own initial scroll.
  const isNearBottomRef = useRef(!opts?.skipInitialScroll);
  const prevLengthRef = useRef(items.length);

  function onScroll() {
    const el = containerRef.current;
    if (!el) return;
    isNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
  }

  useEffect(() => {
    const grew = items.length > prevLengthRef.current;
    prevLengthRef.current = items.length;
    // Only content growth (a new message) should ever move the scroll position — a poll that
    // just refreshes existing messages (read receipts, edits) must never touch it. Setting
    // scrollTop directly (rather than scrollIntoView) keeps this to the chat pane itself,
    // never an ancestor scroll container.
    if (!grew || !isNearBottomRef.current) return;
    const el = containerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length]);

  return { containerRef, endRef, onScroll };
}
