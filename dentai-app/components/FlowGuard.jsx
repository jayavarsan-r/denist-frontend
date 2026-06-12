'use client';
import { useEffect, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAppStore } from '@/store/useAppStore';
import { getToken } from '@/lib/api/client';
import { getMe as getAuthMe } from '@/lib/services/auth.service';

// Decode JWT payload without verification — for offline fallback only.
// Security is still enforced server-side on every API call.
function decodeJwt(token) {
  try {
    const payload = token.split('.')[1];
    return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
  } catch { return null; }
}

// Paths that do NOT require authentication
const PUBLIC_PATHS = ['/login', '/onboarding'];

// Paths that require auth but skip other flow checks
const AUTH_ONLY_PATHS = ['/doctor/setup', '/roles'];

// Doctor-only routes — receptionists are redirected to their queue view instead.
const DOCTOR_ONLY_PATHS = ['/', '/consultation'];

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

  // Restore the persisted identity (name/clinic/role) from localStorage after mount.
  // Done here rather than at store-init to keep server HTML and the first client
  // render identical (skipHydration). /api/auth/me still runs below to refresh it.
  useEffect(() => {
    useAppStore.persist.rehydrate();
  }, []);

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
        .catch((err) => {
          hydrating.current = false;
          if (err?.response?.status === 401) {
            // Token explicitly rejected by server — must re-login
            signOut();
            router.replace('/login');
          } else {
            // Network/server error (offline, backend starting up) —
            // decode JWT locally for a minimal offline session so the app stays usable
            const decoded = decodeJwt(token);
            if (decoded?.dentistId) {
              hydrateAuth({
                staff: { id: decoded.staffId || null, role: decoded.role || 'doctor', status: 'active' },
                clinic: { id: decoded.clinicId || null, join_code: null },
              });
            }
          }
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

    // Receptionists have no doctor home or consultation flow — keep them on the queue.
    if (role === 'receptionist' && DOCTOR_ONLY_PATHS.includes(normPath)) {
      router.replace('/reception');
      return;
    }
  }, [started, role, doctorSetupDone, pathname]);

  return null;
}
