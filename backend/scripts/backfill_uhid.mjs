// One-off: assign per-clinic sequential UHIDs to patients missing one.
// Idempotent — only touches rows where uhid is null. Run: node scripts/backfill_uhid.mjs
import { createClient } from '@supabase/supabase-js';
import { clinicPrefix, formatUhid } from '../src/utils/uhid.js';
import 'dotenv/config';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const { data: clinics } = await supabase.from('clinics').select('id, name, display_id');
for (const clinic of clinics || []) {
  const prefix = clinicPrefix(clinic);
  const { data: patients } = await supabase.from('patients')
    .select('id, uhid, created_at').eq('clinic_id', clinic.id).order('created_at', { ascending: true });
  let seq = 0;
  for (const p of patients || []) {
    seq++;
    if (p.uhid) continue; // keep existing
    const uhid = formatUhid(prefix, seq);
    await supabase.from('patients').update({ uhid }).eq('id', p.id);
    console.log(`${clinic.name}: ${p.id} -> ${uhid}`);
  }
}
console.log('UHID backfill complete.');
