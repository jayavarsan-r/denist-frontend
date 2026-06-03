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
 * @returns {() => void} unsubscribe function
 */
export async function subscribeToQueue(clinicId, onUpdate) {
  const sb = await getSupabase();
  if (!sb) return () => {};

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
        onUpdate(payload.new || payload.old, payload.eventType);
      }
    )
    .subscribe();

  return () => {
    sb.removeChannel(channel);
  };
}

/**
 * Subscribe to appointments changes for a clinic.
 *
 * @param {string} clinicId
 * @param {() => void} onUpdate  — called whenever an appointment changes
 * @returns {() => void} unsubscribe function
 */
export async function subscribeToAppointments(clinicId, onUpdate) {
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
      () => {
        onUpdate();
      }
    )
    .subscribe();

  return () => {
    sb.removeChannel(channel);
  };
}
