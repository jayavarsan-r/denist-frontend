/* ============================================================================
 * DentAI — end-to-end smoke test (no new deps; Node 18+ global fetch).
 *
 * Exercises EVERY major backend feature against a running server and prints a
 * PASS/FAIL summary. Exits non-zero if anything fails (CI-friendly).
 *
 * Usage:
 *   1. Start the backend:  PORT=4000 npm start
 *   2. Run:                node scripts/smoke.js
 *      (override base/login)  BASE=http://localhost:4000 PHONE=1234567891 OTP=123456 node scripts/smoke.js
 *
 * Note: this is an INTEGRATION test — it creates real rows in your Supabase
 * (under the demo login). Point it at a test/demo clinic.
 * ==========================================================================*/

const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const BASE = process.env.BASE || 'http://localhost:4000';
const PHONE = process.env.PHONE || '1234567891';
const OTP = process.env.OTP || '123456';

let TOKEN = null;
const results = [];
const todayISO = new Date().toISOString().slice(0, 10);
const plusDaysISO = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

function log(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`${ok ? '✅' : '❌'}  ${name}${detail ? `  — ${detail}` : ''}`);
}

async function api(method, p, { body, token = TOKEN, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (form) { payload = form; }
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  const res = await fetch(`${BASE}${p}`, { method, headers, body: payload });
  let json = null;
  try { json = await res.json(); } catch { /* non-json */ }
  // unwrap { success, data }
  const data = json && typeof json === 'object' && 'success' in json && json.success ? (('data' in json) ? json.data : json) : json;
  return { status: res.status, data, raw: json };
}

async function main() {
  console.log(`\n🔬 DentAI smoke test → ${BASE}\n`);

  // ── Health ──
  try { const r = await api('GET', '/api/queue', { token: null }); log('server reachable (401 expected)', r.status === 401, `HTTP ${r.status}`); }
  catch (e) { log('server reachable', false, e.message); console.log('\n⚠️  Is the backend running on ' + BASE + '?'); process.exit(1); }

  // ── Auth ──
  await api('POST', '/api/auth/send-otp', { body: { phone: PHONE }, token: null });
  const verify = await api('POST', '/api/auth/verify-otp', { body: { phone: PHONE, otp: OTP }, token: null });
  TOKEN = verify.data?.token;
  log('auth: verify-otp returns token', !!TOKEN, `HTTP ${verify.status}`);
  if (!TOKEN) { console.log('\n⚠️  Login failed — check PHONE/OTP (dev creds in backend/.env).'); summary(); return; }

  // ── Clinic (heals dentist + gives a clinic-scoped token) ──
  const cc = await api('POST', '/api/auth/create-clinic', { body: { clinicName: 'Smoke Clinic', yourName: 'Dr Smoke', city: 'Test' } });
  if (cc.data?.token) TOKEN = cc.data.token;
  log('auth: create-clinic', cc.status === 201 || cc.status === 200, `HTTP ${cc.status}`);

  // ── Patient ──
  const pc = await api('POST', '/api/patients', { body: { name: 'Smoke Patient', phone: '9000000000', age: 33, gender: 'male' } });
  const pid = pc.data?.patient?.id;
  log('patients: create', !!pid, `HTTP ${pc.status}`);
  log('patients: get by id', !!(await api('GET', `/api/patients/${pid}`)).data?.patient, '');
  const cs = await api('GET', `/api/patients/${pid}/case-sheet`);
  log('patients: case-sheet shape', !!cs.data?.patient && Array.isArray(cs.data?.visits) && !!cs.data?.summary, `HTTP ${cs.status}`);
  const th = await api('GET', `/api/patients/${pid}/tooth-history`);
  log('patients: tooth-history shape', Array.isArray(th.data?.toothMap) && Array.isArray(th.data?.treatmentPlans), `HTTP ${th.status}`);

  // ── Queue + consult + checkout (multi-tooth + follow-up) ──
  const qa = await api('POST', '/api/queue', { body: { patientId: pid, chiefComplaint: 'tooth pain' } });
  const eid = qa.data?.entry?.id || qa.data?.id;
  log('queue: add', !!eid, `HTTP ${qa.status}`);
  const fu = plusDaysISO(7);
  const cons = await api('POST', `/api/queue/${eid}/complete-consult`, { body: {
    patientId: pid, procedure: 'Root Canal', diagnosis: 'Pulpitis', toothNumber: '36',
    toothNumbers: ['36', '37'], totalSittings: 3, estimatedCost: 6000, followUp: fu, transcript: 'rct on 36 and 37',
  } });
  log('queue: complete-consult (multi-tooth + follow-up)', cons.status === 201 || cons.status === 200, `HTTP ${cons.status}`);
  const summ = await api('GET', `/api/queue/${eid}/checkout-summary`);
  const okSummary = summ.data?.summary?.procedure === 'Root Canal' && (summ.data?.summary?.appointments || []).length > 0;
  log('queue: checkout-summary (plan + follow-up appt)', okSummary, `teeth=${JSON.stringify(summ.data?.summary?.teeth)}`);

  // ── Lab orders ──
  const lc = await api('POST', '/api/lab-orders', { body: { patientId: pid, labName: 'Smoke Lab', procedureType: 'Crown', toothNumber: '36', costToClinic: 2000, chargedToPatient: 4000, status: 'sent' } });
  const labId = lc.data?.labOrder?.id;
  log('lab: create', !!labId, `HTTP ${lc.status}`);
  log('lab: clinic list', Array.isArray((await api('GET', '/api/lab-orders')).data?.labOrders), '');
  log('lab: patient list', Array.isArray((await api('GET', `/api/patients/${pid}/lab-orders`)).data?.labOrders), '');
  if (labId) log('lab: mark received', (await api('PATCH', `/api/lab-orders/${labId}`, { body: { status: 'received' } })).data?.labOrder?.status === 'received', '');

  // ── Appointments (duration + cancelled exclusion) ──
  const ac = await api('POST', '/api/appointments', { body: { patientId: pid, appointmentDate: plusDaysISO(2), appointmentTime: '10:00', purpose: 'RCT', durationMinutes: 60 } });
  log('appointments: create', ac.status === 201, `HTTP ${ac.status}`);
  const al = await api('GET', '/api/appointments');
  log('appointments: list', Array.isArray(al.data?.appointments), `count=${al.data?.appointments?.length}`);
  log('appointments: list excludes cancelled', !(al.data?.appointments || []).some(a => a.status === 'cancelled'), '');
  log('appointments: today', Array.isArray((await api('GET', '/api/appointments/today')).data?.appointments), '');
  log('appointments: booked-slots', Array.isArray((await api('GET', `/api/appointments/booked-slots?date=${plusDaysISO(2)}`)).data?.bookedSlots), '');

  // ── AI: intent + extraction (needs GEMINI key) ──
  const ps = await api('POST', '/api/ai/parse-schedule', { body: { transcript: 'RCT for Smoke next Thursday evening' } });
  log('ai: parse-schedule (intent only)', !!ps.data?.intent && ('procedure' in ps.data.intent), `HTTP ${ps.status}`);
  const gn = await api('POST', '/api/ai/generate-note', { body: { transcript: 'Scaling done on 26, charged 1500, follow up in 7 days' } });
  log('ai: generate-note (structured)', !!gn.data?.structured?.procedure, `proc=${gn.data?.structured?.procedure}`);
  const epi = await api('POST', '/api/ai/extract-patient-info', { body: { transcript: 'Karthik, 9876543210, 34, tooth pain' } });
  log('ai: extract-patient-info', !!epi.data && ('name' in epi.data), `name=${epi.data?.name}`);

  // ── AI: transcription (optional — needs `say` + ffmpeg) ──
  try {
    const aiff = path.join(os.tmpdir(), 'smoke.aiff'); const wav = path.join(os.tmpdir(), 'smoke.wav');
    execSync(`say -o ${aiff} "Patient has tooth pain, root canal advised"`, { stdio: 'ignore' });
    execSync(`ffmpeg -hide_banner -loglevel error -i ${aiff} -ar 16000 -ac 1 ${wav} -y`, { stdio: 'ignore' });
    const form = new FormData();
    form.append('audio', new Blob([fs.readFileSync(wav)], { type: 'audio/wav' }), 'smoke.wav');
    const tr = await api('POST', '/api/ai/transcribe', { form });
    log('ai: transcribe (Sarvam)', (tr.data?.transcript || '').length > 0, `"${(tr.data?.transcript || '').slice(0, 40)}"`);
    fs.unlinkSync(aiff); fs.unlinkSync(wav);
  } catch (e) { log('ai: transcribe (skipped)', true, 'say/ffmpeg unavailable'); }

  // ── Cleanup: soft-delete the smoke patient ──
  log('patients: soft delete', (await api('DELETE', `/api/patients/${pid}`)).status < 400, '');

  summary();
}

function summary() {
  const pass = results.filter(r => r.ok).length;
  const fail = results.length - pass;
  console.log(`\n${'─'.repeat(48)}\n${pass}/${results.length} passed${fail ? `, ${fail} FAILED` : ' — all green ✅'}\n`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error('\n💥 smoke test crashed:', e); process.exit(1); });
