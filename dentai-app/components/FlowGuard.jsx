'use client';
import { useEffect, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAppStore } from '@/store/useAppStore';
import { getToken } from '@/lib/api/client';
import { getMe as getAuthMe } from '@/lib/services/auth.service';

// Paths that do NOT require authentication
const PUBLIC_PATHS = ['/login', '/onboarding'];

// Paths that require auth but skip other flow checks
const AUTH_ONLY_PATHS = ['/doctor/setup', '/roles'];

export default function FlowGuard() {
  const router = useRouter();
  const pathname = usePathname();
  const hydrateAuth = useAppStore((s) => s.hydrateAuth);
  const signOut = useAppStore((s) => s.signOut);
  const role = useAppStore((s) => s.role);
  const started = useAppStore((s) => s.started);
  const doctorSetupDone = useAppStore((s) => s.doctorSetupDone);
  const hydrating = useRef(false);

  const normPath = pathname !== '/' ? pathname.replace(/\/$/, '') : '/';
  const isPublic = PUBLIC_PATHS.includes(normPath);

  useEffect(() => {
    // Listen for session expiry events dispatched by the API client
    const handleExpiry = () => {
      signOut();
      router.replace('/login');
    };
    window.addEventListener('dentai:auth-expired', handleExpiry);
    return () => window.removeEventListener('dentai:auth-expired', handleExpiry);
  }, []);

  useEffect(() => {
    const token = getToken();

    // Allow public paths without a token
    if (isPublic) return;

    // No token → send to login
    if (!token) {
      router.replace('/login');
      return;
    }

    // Token exists but store not yet hydrated → call /api/auth/me once
    if (!started && !hydrating.current) {
      hydrating.current = true;
      getAuthMe()
        .then((res) => {
          hydrateAuth({ staff: res.staff, clinic: res.clinic });
          hydrating.current = false;
        })
        .catch(() => {
          // Token invalid or expired
          signOut();
          router.replace('/login');
          hydrating.current = false;
        });
      return;
    }

    // Store hydrated — apply flow rules
    if (!started) return; // still loading

    const isAuthOnly = AUTH_ONLY_PATHS.includes(normPath);
    if (isAuthOnly) return; // let setup/roles screens render freely

    if (!role) {
      router.replace('/roles');
      return;
    }

    if (role === 'doctor' && !doctorSetupDone) {
      router.replace('/doctor/setup');
      return;
    }
  }, [started, role, doctorSetupDone, pathname]);

  return null;
}
