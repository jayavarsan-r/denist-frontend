'use client';
import { useEffect, useRef } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { useQueueStore } from '@/store/useQueueStore';
import { subscribeToQueue } from '@/lib/realtime';

/**
 * Loads the queue on mount and subscribes to Supabase Realtime updates.
 * Components that use the queue should call this hook once at their root.
 */
// Fallback poll interval, used ONLY while realtime is disconnected. When realtime is
// healthy it pushes incremental updates (mergeEntry) and we don't poll at all — the
// old code refetched the whole queue every 5s regardless, which at N open clients was
// pure wasted load on top of a working subscription.
const FALLBACK_POLL_MS = 15000;

export function useQueueRealtime() {
  const clinicId = useAppStore((s) => s.clinicId);
  const loadQueue = useQueueStore((s) => s.loadQueue);
  const mergeEntry = useQueueStore((s) => s.mergeEntry);
  const unsubRef = useRef(null);
  const pollRef = useRef(null);

  useEffect(() => {
    // No clinic context yet (logged out / pre-hydration) → don't hit the API.
    if (!clinicId) return;
    loadQueue();

    let cancelled = false;
    const stopPoll = () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
    const startPoll = () => { if (!pollRef.current) pollRef.current = setInterval(() => loadQueue(), FALLBACK_POLL_MS); };

    // Until the subscription confirms it's connected, poll as a fallback.
    startPoll();

    subscribeToQueue(
      clinicId,
      (entry, eventType) => {
        if (eventType === 'DELETE') loadQueue();
        else mergeEntry(entry);
      },
      (connected) => {
        if (cancelled) return;
        // Realtime is live → stop polling (incremental pushes keep us fresh).
        // Realtime dropped → resume the fallback poll, and resync once.
        if (connected) { stopPoll(); }
        else { startPoll(); loadQueue(); }
      },
    ).then((unsub) => {
      if (cancelled) { unsub(); return; }
      unsubRef.current = unsub;
    });

    return () => {
      cancelled = true;
      stopPoll();
      if (unsubRef.current) { unsubRef.current(); unsubRef.current = null; }
    };
  }, [clinicId]);
}
