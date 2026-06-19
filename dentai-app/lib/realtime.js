'use client';

/**
 * Supabase Realtime subscriptions for DentAI.
 *
 * Only used for push updates (read-only from the client).
 * All mutations still go through the Express backend.
 *
 * Required env vars (NEXT_PUBLIC_ prefix for static export):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY
 */

let supabaseClient = null;
let initialized = false;

async function getSupabase() {
  if (supabaseClient) return supabaseClient;
  if (initialized) return null;
  initialized = true;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key || url.includes('your-project')) {
    console.warn('[Realtime] Supabase env vars not configured — realtime disabled');
    return null;
  }

  try {
    const { createClient } = await import('@supabase/supabase-js');
    supabaseClient = createClient(url, key, {
      realtime: { params: { eventsPerSecond: 10 } },
    });
    return supabaseClient;
  } catch (e) {
    console.error('[Realtime] Failed to init Supabase client', e);
    return null;
  }
}

/**
 * Subscribe to queue_entries changes for a clinic.
 *
 * @param {string} clinicId
 * @param {(entry: object, eventType: string) => void} onUpdate
 * @param {(connected: boolean) => void} [onStatus] — called with true once the
 *   channel is SUBSCRIBED, false on error/timeout/close. Lets callers run a polling
 *   fallback ONLY while realtime is down (instead of always polling).
 * @returns {() => void} unsubscribe function
 */
export async function subscribeToQueue(clinicId, onUpdate, onStatus) {
  try {
    const sb = await getSupabase();
    if (!sb) { try { onStatus?.(false); } catch {} return () => {}; }

    const channel = sb
      .channel(`queue:${clinicId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'queue_entries',
          filter: `clinic_id=eq.${clinicId}`,
        },
        (payload) => {
          try { onUpdate(payload.new || payload.old, payload.eventType); } catch {}
        }
      )
      .subscribe((status, err) => {
        if (err) console.warn('[Realtime] queue subscription error:', err.message);
        // SUBSCRIBED = connected; CHANNEL_ERROR / TIMED_OUT / CLOSED = not.
        try { onStatus?.(status === 'SUBSCRIBED'); } catch {}
      });

    return () => { try { sb.removeChannel(channel); } catch {} };
  } catch (e) {
    console.warn('[Realtime] subscribeToQueue failed (realtime may not be enabled):', e.message);
    try { onStatus?.(false); } catch {}
    return () => {};
  }
}

/**
 * Subscribe to ONE consultation draft row (the async voice pipeline result).
 * Fires on every UPDATE — the worker moves status processing → pending_review
 * | error and fills extracted/safety_flags.
 *
 * @param {string} draftId
 * @param {(draft: object) => void} onUpdate
 * @returns {() => void} unsubscribe function
 */
export async function subscribeToDraft(draftId, onUpdate) {
  try {
    const sb = await getSupabase();
    if (!sb) return () => {};

    const channel = sb
      .channel(`draft:${draftId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'consultation_drafts',
          filter: `id=eq.${draftId}`,
        },
        (payload) => {
          try { onUpdate(payload.new); } catch {}
        }
      )
      .subscribe((status, err) => {
        if (err) console.warn('[Realtime] draft subscription error:', err.message);
      });

    return () => { try { sb.removeChannel(channel); } catch {} };
  } catch (e) {
    console.warn('[Realtime] subscribeToDraft failed:', e.message);
    return () => {};
  }
}

/**
 * Subscribe to appointments changes for a clinic.
 *
 * @param {string} clinicId
 * @param {() => void} onUpdate  — called whenever an appointment changes
 * @returns {() => void} unsubscribe function
 */
export async function subscribeToAppointments(clinicId, onUpdate) {
  try {
    const sb = await getSupabase();
    if (!sb) return () => {};

    const channel = sb
      .channel(`appointments:${clinicId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'appointments',
          filter: `clinic_id=eq.${clinicId}`,
        },
        () => { try { onUpdate(); } catch {} }
      )
      .subscribe((status, err) => {
        if (err) console.warn('[Realtime] appointments subscription error:', err.message);
      });

    return () => { try { sb.removeChannel(channel); } catch {} };
  } catch (e) {
    console.warn('[Realtime] subscribeToAppointments failed (realtime may not be enabled):', e.message);
    return () => {};
  }
}
