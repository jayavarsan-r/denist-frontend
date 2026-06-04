/**
 * Demo seed script
 * Phone: 1234567891  |  OTP: 012345
 * Run: node seed-demo.js
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const PHONE = '1234567891';
const d = (n) => { const x = new Date(); x.setDate(x.getDate() - n); return x.toISOString().slice(0, 10); };
const f = (n) => { const x = new Date(); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
const TODAY = new Date().toISOString().slice(0, 10);

async function run() {
  console.log('🌱  Seeding demo account for', PHONE, '…\n');

  // ── 1. Pin OTP forever ──────────────────────────────────────────────────────
  await sb.from('otp_codes').delete().eq('phone', PHONE);
  const { error: otpErr } = await sb.from('otp_codes').insert({
    phone: PHONE, code: '012345',
    expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    used: false,
  });
  if (otpErr) throw new Error('OTP: ' + otpErr.message);
  console.log('✅  OTP pinned (012345, expires in 1 year)');

  // ── 2. Dentist ──────────────────────────────────────────────────────────────
  let { data: dentist } = await sb.from('dentists').select('*').eq('phone', PHONE).single();
  if (!dentist) {
    const { data, error } = await sb.from('dentists').insert({ phone: PHONE, name: 'Dr. Arjun Mehta', clinic_name: 'SmileCare Dental' }).select().single();
    if (error) throw new Error('Dentist: ' + error.message);
    dentist = data;
  } else {
    await sb.from('dentists').update({ name: 'Dr. Arjun Mehta', clinic_name: 'SmileCare Dental' }).eq('id', dentist.id);
  }
  const D = dentist.id;
  console.log('✅  Dentist:', D);

  // ── 3. Clinic ───────────────────────────────────────────────────────────────
  let { data: existingStaff } = await sb.from('staff').select('clinic_id').eq('dentist_id', D).single();
  let clinic;
  if (existingStaff?.clinic_id) {
    const { data } = await sb.from('clinics').select('*').eq('id', existingStaff.clinic_id).single();
    await sb.from('clinics').update({ name: 'SmileCare Dental', city: 'Chennai' }).eq('id', data.id);
    clinic = { ...data, name: 'SmileCare Dental', city: 'Chennai' };
  } else {
    const { data: taken } = await sb.from('clinics').select('id').eq('join_code', 'SMILE1').single();
    const jc = taken ? 'SM' + Math.floor(1000 + Math.random() * 9000) : 'SMILE1';
    const { data, error } = await sb.from('clinics').insert({ name: 'SmileCare Dental', city: 'Chennai', join_code: jc, display_id: 'DENT-CHN-001' }).select().single();
    if (error) throw new Error('Clinic: ' + error.message);
    clinic = data;
  }
  const C = clinic.id;
  console.log('✅  Clinic:', C, '| join:', clinic.join_code);

  // ── 4. Staff ────────────────────────────────────────────────────────────────
  let { data: staff } = await sb.from('staff').select('*').eq('dentist_id', D).eq('clinic_id', C).single();
  if (!staff) {
    const { data, error } = await sb.from('staff').insert({ clinic_id: C, dentist_id: D, phone: PHONE, name: 'Dr. Arjun Mehta', role: 'doctor', status: 'active' }).select().single();
    if (error) throw new Error('Staff: ' + error.message);
    staff = data;
    await sb.from('clinics').update({ owner_staff_id: staff.id }).eq('id', C);
  }
  console.log('✅  Staff:', staff.id);

  // ── 5. Patients ──────────────────────────────────────────────────────────────
  const patientDefs = [
    { name: 'Ramesh Kumar',    phone: '9841100001', age: 45, gender: 'Male',   medical_conditions: 'Type 2 Diabetes, Hypertension',       allergies: 'Penicillin',   clinical_flags: 'diabetes,hypertension' },
    { name: 'Priya Sharma',    phone: '9841100002', age: 29, gender: 'Female', medical_conditions: 'Pregnancy (28 weeks)',                 allergies: '',             clinical_flags: 'pregnant' },
    { name: 'Vikram Nair',     phone: '9841100003', age: 24, gender: 'Male',   medical_conditions: 'Anxiety (mild)',                       allergies: 'NSAIDs',       clinical_flags: '' },
    { name: 'Ananya Krishnan', phone: '9841100004', age: 16, gender: 'Female', medical_conditions: 'None',                                 allergies: '',             clinical_flags: '' },
    { name: 'Mohammed Ali',    phone: '9841100005', age: 57, gender: 'Male',   medical_conditions: 'Post-MI (2022), Atrial Fibrillation', allergies: 'Sulfa drugs',  clinical_flags: 'heart,blood_thinners' },
    { name: 'Sunita Patel',    phone: '9841100006', age: 34, gender: 'Female', medical_conditions: 'None',                                 allergies: '',             clinical_flags: '' },
    { name: 'Deepak Reddy',    phone: '9841100007', age: 48, gender: 'Male',   medical_conditions: 'Type 2 Diabetes',                     allergies: '',             clinical_flags: 'diabetes' },
    { name: 'Kavya Iyer',      phone: '9841100008', age: 22, gender: 'Female', medical_conditions: 'None',                                 allergies: '',             clinical_flags: '' },
    { name: 'Rajesh Gupta',    phone: '9841100009', age: 63, gender: 'Male',   medical_conditions: 'Hypertension, IHD',                   allergies: 'Latex',        clinical_flags: 'heart,hypertension' },
    { name: 'Meera Nair',      phone: '9841100010', age: 27, gender: 'Female', medical_conditions: 'None',                                 allergies: '',             clinical_flags: '' },
  ];

  const patients = [];
  for (const def of patientDefs) {
    let { data: existing } = await sb.from('patients').select('*').eq('phone', def.phone).eq('dentist_id', D).single();
    if (!existing) {
      const { data, error } = await sb.from('patients').insert({ ...def, dentist_id: D, clinic_id: C }).select().single();
      if (error) { console.warn('  ⚠️  Patient skip:', def.name, error.message); continue; }
      existing = data;
    }
    patients.push(existing);
  }
  console.log(`✅  ${patients.length} patients ready`);

  const pid = (name) => patients.find(p => p.name === name)?.id;

  // ── 6. Appointments ──────────────────────────────────────────────────────────
  const appts = [
    { name: 'Ramesh Kumar',    date: d(14), time: '10:00', purpose: 'Periodontal Review',          status: 'completed' },
    { name: 'Ramesh Kumar',    date: d(45), time: '10:30', purpose: 'Scaling & Root Planing',       status: 'completed' },
    { name: 'Priya Sharma',    date: d(7),  time: '11:00', purpose: 'Scaling & Polishing',          status: 'completed' },
    { name: 'Vikram Nair',     date: d(3),  time: '14:00', purpose: 'Surgical Extraction (38)',     status: 'completed' },
    { name: 'Mohammed Ali',    date: d(10), time: '09:30', purpose: 'Crown Cementation (26)',        status: 'completed' },
    { name: 'Mohammed Ali',    date: d(30), time: '09:00', purpose: 'Crown Preparation (26)',        status: 'completed' },
    { name: 'Sunita Patel',    date: d(5),  time: '15:30', purpose: 'Class II Filling (26)',         status: 'completed' },
    { name: 'Kavya Iyer',      date: d(21), time: '16:00', purpose: 'Scaling & Polishing',          status: 'completed' },
    { name: 'Rajesh Gupta',    date: d(60), time: '10:00', purpose: 'Denture Review',               status: 'completed' },
    { name: 'Ananya Krishnan', date: TODAY, time: '10:00', purpose: 'Orthodontic Consultation',     status: 'confirmed' },
    { name: 'Deepak Reddy',    date: TODAY, time: '11:30', purpose: 'Implant Consultation',          status: 'arrived'   },
    { name: 'Priya Sharma',    date: TODAY, time: '14:00', purpose: 'Pregnancy Oral Health Review', status: 'confirmed' },
    { name: 'Ramesh Kumar',    date: f(3),  time: '10:00', purpose: 'Periodontal Maintenance',      status: 'scheduled' },
    { name: 'Meera Nair',      date: f(5),  time: '15:00', purpose: 'Whitening Consultation',       status: 'scheduled' },
    { name: 'Sunita Patel',    date: f(7),  time: '09:30', purpose: 'Class II Filling (36)',         status: 'scheduled' },
    { name: 'Rajesh Gupta',    date: f(10), time: '11:00', purpose: 'Denture Reline',               status: 'scheduled' },
    { name: 'Vikram Nair',     date: f(14), time: '14:30', purpose: 'Post-op Review',               status: 'scheduled' },
    { name: 'Deepak Reddy',    date: f(21), time: '10:00', purpose: 'Implant Planning (CBCT Review)', status: 'scheduled' },
  ];

  let apptCount = 0;
  for (const a of appts) {
    const patient_id = pid(a.name);
    if (!patient_id) continue;
    const { error } = await sb.from('appointments').insert({ patient_id, dentist_id: D, clinic_id: C, appointment_date: a.date, appointment_time: a.time, purpose: a.purpose, status: a.status });
    if (!error) apptCount++;
  }
  console.log(`✅  ${apptCount} appointments created`);

  // ── 7. Visits (clinical records) ────────────────────────────────────────────
  const visitDefs = [
    {
      name: 'Ramesh Kumar', date: d(14), procedure: 'Periodontal Review & CHX Irrigation',
      notes: 'BOP reduced to 22% from 38%. Pocket depths 4-5mm posterior sextants. Subgingival irrigation 0.2% CHX. Good patient compliance — using electric toothbrush as advised.',
      meds: JSON.stringify([{ name: 'Metronidazole', dosage: '400mg', frequency: 'TDS', duration: '5 days', notes: 'After food' }, { name: 'Chlorhexidine Mouthwash 0.2%', dosage: '10ml rinse', frequency: 'BD', duration: '14 days', notes: 'Do not eat/drink 30min after' }]),
      next: 'Review in 4 weeks. Consider surgical pocket reduction if no further improvement in BOP.',
      followUp: f(3), cost: 1200,
    },
    {
      name: 'Ramesh Kumar', date: d(45), procedure: 'Full Mouth Scaling & Root Planing',
      notes: 'Full mouth SRP under LA (2% xylocaine). Piezoelectric scaler used. Heavy supragingival and subgingival calculus removed esp. 36,37,46,47. OHI given — Bass technique demonstrated with disclosing tablet.',
      meds: JSON.stringify([{ name: 'Amoxicillin', dosage: '500mg', frequency: 'TDS', duration: '5 days', notes: 'With food' }, { name: 'Metronidazole', dosage: '400mg', frequency: 'TDS', duration: '5 days', notes: 'After food' }, { name: 'Ibuprofen', dosage: '400mg', frequency: 'SOS', duration: '3 days', notes: 'For pain' }]),
      next: 'Review periodontal status in 4 weeks. Patient to use electric toothbrush only.',
      followUp: d(14), cost: 3500,
    },
    {
      name: 'Priya Sharma', date: d(7), procedure: 'Scaling & Polishing (Pregnancy-safe)',
      notes: 'Gentle supragingival scaling, 2nd trimester safe window. Avoided posterior region to minimize gag reflex. Mild pregnancy gingivitis present. No LA used. Patient comfortable.',
      meds: JSON.stringify([{ name: 'Chlorhexidine Mouthwash 0.12%', dosage: '10ml', frequency: 'BD', duration: '7 days', notes: 'Pregnancy-safe concentration' }]),
      next: 'Monthly monitoring through Q3. Refer to OB if gingival enlargement worsens.',
      followUp: TODAY, cost: 800,
    },
    {
      name: 'Vikram Nair', date: d(3), procedure: 'Surgical Extraction — 38 (Mesioangular Impaction)',
      tooth: '38',
      notes: 'Tooth 38 horizontally impacted, mesioangular. Diazepam 5mg pre-med 1hr prior. Incision and mucoperiosteal flap raised. Bone guttered using round bur. Tooth sectioned in 3 parts and removed in segments. Socket curetted. 3-0 silk sutures x4. Patient tolerated well despite initial anxiety.',
      meds: JSON.stringify([{ name: 'Amoxicillin', dosage: '500mg', frequency: 'TDS', duration: '5 days', notes: 'With food' }, { name: 'Paracetamol', dosage: '650mg', frequency: 'TDS', duration: '3 days', notes: 'After food — NO NSAIDs (allergic)' }, { name: 'Metronidazole', dosage: '400mg', frequency: 'TDS', duration: '5 days', notes: 'After food' }]),
      next: 'Suture removal in 7 days. Liquid diet 48h. No spitting/smoking/straws. Call if fever or trismus.',
      followUp: f(4), cost: 4500,
    },
    {
      name: 'Mohammed Ali', date: d(10), procedure: 'PFM Crown Cementation — 26',
      tooth: '26',
      notes: 'PFM crown cemented on 26 with GIC luting cement. Occlusion checked — no premature contacts. Aesthetics satisfactory to patient. INR pre-check: 2.8 (safe range). No bleeding complications. Margins sealed well.',
      meds: JSON.stringify([{ name: 'Paracetamol', dosage: '500mg', frequency: 'SOS', duration: '2 days', notes: 'Only if pain. NO aspirin or NSAIDs.' }]),
      next: 'Review in 3 months. Continue Warfarin as prescribed by cardiologist. Annual crown check.',
      followUp: f(80), cost: 8000,
    },
    {
      name: 'Mohammed Ali', date: d(30), procedure: 'Crown Preparation & Impression — 26',
      tooth: '26',
      notes: 'Caries on 26 excavated. Pulp vitality confirmed. Full veneer crown preparation done. Gingival retraction cord placed. Polyvinyl siloxane impression taken. Temporary acrylic crown cemented. Shade A2 selected. Lab instructions sent.',
      meds: JSON.stringify([{ name: 'Paracetamol', dosage: '500mg', frequency: 'SOS', duration: '3 days', notes: 'Only if pain. Avoid chewing hard foods on temporary crown.' }]),
      next: 'Permanent crown delivery in 10 days. Call if temporary crown dislodges.',
      followUp: d(10), cost: 2000,
    },
    {
      name: 'Sunita Patel', date: d(5), procedure: 'Class II Composite Filling — 26',
      tooth: '26',
      notes: 'Deep caries on 26 MO surface. LA: 2% xylocaine 1:80000 adrenaline (buccal infiltration). Caries excavated with spoon excavator. Calcium hydroxide liner placed over deep area. 3M Filtek Z350 composite (shade A2) placed in increments. Occlusal contacts balanced. High gloss polish achieved.',
      meds: JSON.stringify([{ name: 'Paracetamol', dosage: '650mg', frequency: 'SOS', duration: '2 days', notes: 'Only if post-op pain' }]),
      next: 'Filling on 36 pending — book in 2 weeks. Avoid very cold/hot for 48h.',
      followUp: f(7), cost: 1800,
    },
    {
      name: 'Kavya Iyer', date: d(21), procedure: 'Scaling, Polishing & Fluoride Varnish',
      notes: 'Supragingival scaling — light calculus deposits mainly on lower anteriors. Prophy paste polishing. Fluoride varnish applied (Clinpro 5000). Mild generalized gingivitis — patient educated on proper flossing technique. Tobacco use discussed — patient counselled on cessation.',
      meds: JSON.stringify([{ name: 'Sensodyne (Sensitive) Toothpaste', dosage: 'Pea-sized', frequency: 'BD', duration: 'Ongoing', notes: 'For post-scaling sensitivity' }]),
      next: 'Recall in 6 months for maintenance. Tobacco cessation support offered.',
      followUp: f(160), cost: 1000,
    },
    {
      name: 'Rajesh Gupta', date: d(60), procedure: 'Complete Upper Denture Review & Adjustment',
      notes: 'Complete upper denture (5 years old). Peripheral seal inadequate. Pressure sore on left buccal flange — adjusted with acrylic bur and pressure indicator paste. Patient reports looseness during mastication. OVD appears correct. Retention reduced due to alveolar resorption. Chairside reline recommended.',
      meds: JSON.stringify([{ name: 'Corega Denture Adhesive', dosage: 'Small bead', frequency: 'OD morning', duration: 'Until reline', notes: 'Temporary measure for retention' }]),
      next: 'Schedule chairside reline appointment. Discuss new denture if patient agreeable.',
      followUp: f(10), cost: 500,
    },
    {
      name: 'Deepak Reddy', date: d(14), procedure: 'Implant Consultation & CBCT Analysis',
      notes: 'Patient presents with missing 15, 16, 17. CBCT reviewed: bone height 12mm at 15 site, 10mm at 16, 9mm at 17. Width adequate (7-8mm). Sinus floor visible — sinus lift may be needed at 17. HbA1c 7.1% — acceptable. Non-smoker, good systemic control. Single-stage implants planned for 15 and 16.',
      meds: JSON.stringify([]),
      next: 'Consult maxillofacial surgeon for 17 site (sinus proximity). Book implant surgery after endocrinologist clearance.',
      followUp: f(21), cost: 1500,
    },
  ];

  let visitCount = 0;
  for (const v of visitDefs) {
    const patient_id = pid(v.name);
    if (!patient_id) continue;
    const { error } = await sb.from('visits').insert({
      patient_id, dentist_id: D, clinic_id: C,
      visit_date: v.date,
      procedure_name: v.procedure,
      tooth_number: v.tooth || null,
      notes: v.notes,
      medications: v.meds,
      next_steps: v.next,
      follow_up_date: v.followUp,
      cost: v.cost,
      status: 'completed',
    });
    if (error) { console.warn('  ⚠️  Visit skip:', v.name, error.message); } else visitCount++;
  }
  console.log(`✅  ${visitCount} clinical visits created`);

  // ── 8. Treatment Plans ───────────────────────────────────────────────────────
  const plans = [
    { name: 'Ramesh Kumar',  procedure: 'Periodontal Treatment (Full Mouth)',   total: 4, done: 2, cost: 12000, collected: 7000, diagnosis: 'Chronic Generalized Periodontitis Stage III Grade B' },
    { name: 'Mohammed Ali',  procedure: 'Full Ceramic Crown — 16',              total: 2, done: 2, cost: 10000, collected: 10000, diagnosis: 'Caries — 16 distal wall destruction' },
    { name: 'Deepak Reddy',  procedure: 'Dental Implants — 15, 16',             total: 5, done: 1, cost: 60000, collected: 15000, diagnosis: 'Partial edentulism upper posterior' },
    { name: 'Sunita Patel',  procedure: 'Composite Restorations — 26, 36',      total: 2, done: 1, cost: 3600,  collected: 1800,  diagnosis: 'Active caries — 26 MO, 36 distal' },
    { name: 'Ananya Krishnan', procedure: 'Fixed Orthodontic Appliance Therapy', total: 24, done: 0, cost: 45000, collected: 0, diagnosis: 'Skeletal Class II, dental crowding upper arch' },
    { name: 'Rajesh Gupta', procedure: 'Complete Upper Denture (New)',           total: 3, done: 0, cost: 15000, collected: 0, diagnosis: 'Complete edentulism — upper arch, denture 5 yrs old' },
  ];

  let planCount = 0;
  for (const pl of plans) {
    const patient_id = pid(pl.name);
    if (!patient_id) continue;
    const { error } = await sb.from('treatment_plans').insert({
      patient_id, dentist_id: D, clinic_id: C,
      diagnosis: pl.diagnosis,
      procedure_name: pl.procedure,
      total_sittings: pl.total,
      completed_sittings: pl.done,
      estimated_cost: pl.cost,
      collected_amount: pl.collected,
      status: pl.done >= pl.total ? 'completed' : 'active',
      start_date: d(45),
    });
    if (error) { console.warn('  ⚠️  Plan skip:', pl.name, error.message); } else planCount++;
  }
  console.log(`✅  ${planCount} treatment plans created`);

  // ── 9. Prescriptions ─────────────────────────────────────────────────────────
  const rxDefs = [
    {
      name: 'Ramesh Kumar',
      meds: [{ name: 'Metronidazole', dosage: '400mg', frequency: 'TDS', duration: '5 days', notes: 'After food' }, { name: 'Chlorhexidine Mouthwash', dosage: '10ml', frequency: 'BD', duration: '14 days', notes: 'Do not rinse after' }],
      instructions: 'Soft diet. No spicy or very hot food. Ultra-soft toothbrush only. Review in 4 weeks.',
    },
    {
      name: 'Vikram Nair',
      meds: [{ name: 'Amoxicillin', dosage: '500mg', frequency: 'TDS', duration: '5 days', notes: 'With food' }, { name: 'Paracetamol', dosage: '650mg', frequency: 'TDS', duration: '3 days', notes: 'After food — NO Ibuprofen' }, { name: 'Metronidazole', dosage: '400mg', frequency: 'TDS', duration: '5 days', notes: 'After food' }],
      instructions: 'Liquid diet 48 hours. Ice pack on cheek (20min on, 20min off) for first 6 hours. No spitting, smoking, straws. If fever > 38°C or worsening swelling — visit emergency.',
    },
    {
      name: 'Sunita Patel',
      meds: [{ name: 'Paracetamol', dosage: '650mg', frequency: 'SOS', duration: '2 days', notes: 'Only if pain' }],
      instructions: 'Avoid very cold or hot food on filled tooth for 48 hours. Normal brushing from day 2.',
    },
    {
      name: 'Mohammed Ali',
      meds: [{ name: 'Paracetamol', dosage: '500mg', frequency: 'SOS', duration: '2 days', notes: 'Only if discomfort. NO aspirin. NO NSAIDs.' }],
      instructions: 'Continue all cardiac medications as prescribed. Soft diet for 48 hours. Avoid chewing hard foods on cemented crown for 24 hours.',
    },
  ];

  let rxCount = 0;
  for (const rx of rxDefs) {
    const patient_id = pid(rx.name);
    if (!patient_id) continue;
    const { error } = await sb.from('prescriptions').insert({ patient_id, dentist_id: D, clinic_id: C, medicines: rx.meds, instructions: rx.instructions });
    if (error) { console.warn('  ⚠️  Rx skip:', rx.name, error.message); } else rxCount++;
  }
  console.log(`✅  ${rxCount} prescriptions created`);

  // ── 10. Summary ──────────────────────────────────────────────────────────────
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🎉  Demo account ready!\n');
  console.log('  Phone  : 1234567891');
  console.log('  OTP    : 012345');
  console.log('  Doctor : Dr. Arjun Mehta');
  console.log('  Clinic : SmileCare Dental, Chennai');
  console.log('  Code   : ' + clinic.join_code + '\n');
  console.log('  Patients:');
  patients.forEach(p => console.log('    •', p.name, `(${p.age}${p.gender[0]}, ${p.medical_conditions || 'healthy'})`));
  console.log('\n  Today\'s appointments: Ananya Krishnan, Deepak Reddy, Priya Sharma');
  console.log('  Upcoming (next 3 weeks): Ramesh, Meera, Sunita, Rajesh, Vikram, Deepak');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

run().catch(e => { console.error('\n❌  Seed failed:', e.message); process.exit(1); });
