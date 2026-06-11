'use client';

import './globals.css';
import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAppStore } from '@/store/useAppStore';
import FlowGuard from '@/components/FlowGuard';
import SheetHost from '@/components/SheetHost';
import BottomNav from '@/components/ui/BottomNav';
import Toast from '@/components/ui/Toast';
import IOSFrame from '@/components/IOSFrame';
import { useBootstrap } from '@/lib/hooks/useBootstrap';

const HIDE_NAV_PATHS = [
  '/login',
  '/onboarding',
  '/roles',
  '/doctor/setup',
  '/consultation',
];

const DOCTOR_NAV = [
  { id: 'home', icon: 'home', label: 'Home' },
  { id: 'patients', icon: 'person', label: 'Patients' },
  { id: 'consult', icon: 'stethoscope', label: 'Consult' },
  { id: 'schedule', icon: 'calendar', label: 'Schedule' },
  { id: 'finance', icon: 'chart', label: 'Finance' },
];
const RECEPTION_NAV = [
  { id: 'queue', icon: 'queue', label: 'Queue' },
  { id: 'patients', icon: 'person', label: 'Patients' },
  { id: 'schedule', icon: 'calendar', label: 'Schedule' },
  { id: 'finance', icon: 'chart', label: 'Finance' },
];

const TAB_ROUTES = {
  home: '/',
  queue: '/reception',
  patients: '/patients',
  schedule: '/schedule',
  finance: '/finance',
  consult: '/consultation',
};

const ROUTE_TO_TAB = {
  '/': 'home',
  '/reception': 'queue',
  '/patients': 'patients',
  '/schedule': 'schedule',
  '/finance': 'finance',
  '/consultation': 'consult',
};

function AppShell({ children }) {
  useBootstrap(); // load patients, queue, appointments after auth
  const pathname = usePathname();
  const router = useRouter();
  const role = useAppStore((s) => s.role);
  const started = useAppStore((s) => s.started);
  const toast = useAppStore((s) => s.toast);

  // Once authenticated, request files/camera/mic up front (native only, once) so voice
  // and X-ray capture are ready to use without an in-task permission wall.
  useEffect(() => {
    if (!started) return;
    import('@/lib/services/permissions').then(({ primePermissions }) => primePermissions()).catch(() => {});
  }, [started]);

  const normPath = pathname !== '/' ? pathname.replace(/\/$/, '') : '/';

  const isDetailPage =
    (normPath.startsWith('/patients/') && normPath !== '/patients') ||
    normPath.startsWith('/checkout/') ||
    normPath === '/finance/lab';

  const showNav = !HIDE_NAV_PATHS.includes(normPath) && !isDetailPage;

  const navItems = role === 'receptionist' ? RECEPTION_NAV : DOCTOR_NAV;
  const activeTab = ROUTE_TO_TAB[normPath] || 'home';

  const onNav = (id) => {
    router.push(TAB_ROUTES[id] || '/');
  };

  // Capacitor back button
  useEffect(() => {
    let cleanup;
    import('@capacitor/app').then(({ App }) => {
      App.addListener('backButton', () => {
        if (pathname !== '/' && pathname !== '/reception') {
          router.back();
        }
      }).then((listener) => {
        cleanup = listener;
      });
    }).catch(() => {});
    return () => {
      if (cleanup?.remove) cleanup.remove();
    };
  }, [pathname]);

  // Capacitor status bar
  useEffect(() => {
    import('@capacitor/status-bar').then(({ StatusBar, Style }) => {
      StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
      StatusBar.setBackgroundColor({ color: '#F2F2F7' }).catch(() => {});
    }).catch(() => {});
  }, []);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        background: 'var(--bg)',
        fontFamily: `'Plus Jakarta Sans', -apple-system, system-ui, sans-serif`,
      }}
    >
      <FlowGuard />
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {children}
      </div>
      {showNav && <BottomNav tab={activeTab} onTab={onNav} items={navItems} />}
      <SheetHost />
      <Toast message={toast} />
    </div>
  );
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover"
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <IOSFrame>
          <AppShell>{children}</AppShell>
        </IOSFrame>
      </body>
    </html>
  );
}
