'use client';
import { useEffect, useRef } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { useQueueStore } from '@/store/useQueueStore';
import { subscribeToQueue } from '@/lib/realtime';

/**
 * Loads the queue on mount and subscribes to Supabase Realtime updates.
 * Components that use the queue should call this hook once at their root.
 */
export function useQueueRealtime() {
  const clinicId = useAppStore((s) => s.clinicId);
  const loadQueue = useQueueStore((s) => s.loadQueue);
  const mergeEntry = useQueueStore((s) => s.mergeEntry);
  const unsubRef = useRef(null);

  useEffect(() => {
    // No clinic context yet (logged out / pre-hydration) → don't hit the API.
    if (!clinicId) return;
    loadQueue();

    // Poll every 5s as fallback when realtime is unavailable
    const poll = setInterval(() => loadQueue(), 5000);

    let cancelled = false;
    subscribeToQueue(clinicId, (entry, eventType) => {
      if (eventType === 'DELETE') loadQueue();
      else mergeEntry(entry);
    }).then((unsub) => {
      if (cancelled) { unsub(); return; }
      unsubRef.current = unsub;
    });

    return () => {
      cancelled = true;
      clearInterval(poll);
      if (unsubRef.current) { unsubRef.current(); unsubRef.current = null; }
    };
  }, [clinicId]);
}
