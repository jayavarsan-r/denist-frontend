'use client';
import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAppStore } from '@/store/useAppStore';

const PUBLIC_PATHS = ['/onboarding', '/roles', '/doctor/setup'];

export default function FlowGuard() {
  const router = useRouter();
  const pathname = usePathname();
  const started = useAppStore((s) => s.started);
  const role = useAppStore((s) => s.role);
  const doctorSetupDone = useAppStore((s) => s.doctorSetupDone);

  useEffect(() => {
    if (PUBLIC_PATHS.includes(pathname)) return;
    if (!started) { router.replace('/onboarding'); return; }
    if (!role) { router.replace('/roles'); return; }
    if (role === 'doctor' && !doctorSetupDone) { router.replace('/doctor/setup'); return; }
  }, [started, role, doctorSetupDone, pathname]);

  return null;
}
