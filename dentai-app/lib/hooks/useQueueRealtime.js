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
    loadQueue();

    if (clinicId) {
      subscribeToQueue(clinicId, (entry, eventType) => {
        if (eventType === 'DELETE') {
          // reload on delete since we don't have the deleted row's id reliably
          loadQueue();
        } else {
          mergeEntry(entry);
        }
      }).then((unsub) => {
        unsubRef.current = unsub;
      });
    }

    return () => {
      if (unsubRef.current) {
        unsubRef.current();
        unsubRef.current = null;
      }
    };
  }, [clinicId]);
}
