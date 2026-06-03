'use client';
import { useEffect, useRef } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { usePatientStore } from '@/store/usePatientStore';
import { useQueueStore } from '@/store/useQueueStore';
import { useVisitStore } from '@/store/useVisitStore';

/**
 * Loads core app data once after the user is authenticated.
 * Place this in AppShell so it runs on every page but only fires once per session.
 */
export function useBootstrap() {
  const started = useAppStore((s) => s.started);
  const role = useAppStore((s) => s.role);
  const loadPatients = usePatientStore((s) => s.loadPatients);
  const loadQueue = useQueueStore((s) => s.loadQueue);
  const loadTodayAppointments = useVisitStore((s) => s.loadTodayAppointments);
  const didLoad = useRef(false);

  useEffect(() => {
    if (!started || !role) return;
    if (didLoad.current) return;
    didLoad.current = true;

    // Load in parallel — non-blocking, each handles its own errors
    loadPatients().catch(() => {});
    loadQueue().catch(() => {});
    loadTodayAppointments().catch(() => {});
  }, [started, role]);
}
