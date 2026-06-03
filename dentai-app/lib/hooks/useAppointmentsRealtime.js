'use client';
import { useEffect, useRef } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { useVisitStore } from '@/store/useVisitStore';
import { subscribeToAppointments } from '@/lib/realtime';

/**
 * Loads today's appointments on mount and subscribes to Supabase Realtime
 * updates for the appointments table. Any change triggers a full reload.
 * Components that display the appointment schedule should call this hook
 * once at their root.
 */
export function useAppointmentsRealtime() {
  const clinicId = useAppStore((s) => s.clinicId);
  const loadTodayAppointments = useVisitStore((s) => s.loadTodayAppointments);
  const unsubRef = useRef(null);

  useEffect(() => {
    loadTodayAppointments();

    if (clinicId) {
      subscribeToAppointments(clinicId, () => {
        loadTodayAppointments();
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
