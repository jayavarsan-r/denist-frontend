const supabase = require('../config/supabase');
const jwt = require('jsonwebtoken');

// ── helpers ──────────────────────────────────────────────────────────────────

function makeJoinCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no O,0,I,1
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

async function uniqueJoinCode() {
  let code, exists = true;
  while (exists) {
    code = makeJoinCode();
    const { data } = await supabase.from('clinics').select('id').eq('join_code', code).single();
    exists = !!data;
  }
  return code;
}

function makeDisplayId(city) {
  const prefix = city ? city.substring(0, 3).toUpperCase() : 'CLN';
  const num = String(Math.floor(100 + Math.random() * 900));
  return `DENT-${prefix}-${num}`;
}

function signToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '30d' });
}

// ── send OTP (unchanged) ──────────────────────────────────────────────────────
exports.sendOtp = async (req, res, next) => {
  try {
    const { phone } = req.body;
    if (!phone || !/^\d{10}$/.test(phone))
      return res.status(400).json({ error: 'Valid 10-digit phone required' });

    const otp = process.env.USE_DEV_OTP === 'true'
      ? process.env.DEV_OTP
      : Math.floor(100000 + Math.random() * 900000).toString();

    await supabase.from('otp_codes').delete().eq('phone', phone);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const { error } = await supabase.from('otp_codes').insert({ phone, code: otp, expires_at: expiresAt });
    if (error) throw error;
    res.json({ success: true, message: 'OTP sent' });
  } catch (e) { next(e); }
};

// ── verify OTP — extended to detect new vs returning user ─────────────────────
exports.verifyOtp = async (req, res, next) => {
  try {
    const { phone, otp } = req.body;
    const { data: otpRecord } = await supabase.from('otp_codes')
      .select('*').eq('phone', phone).eq('code', otp).eq('used', false)
      .gt('expires_at', new Date().toISOString()).single();
    if (!otpRecord) return res.status(400).json({ error: 'Invalid or expired OTP' });
    await supabase.from('otp_codes').update({ used: true }).eq('id', otpRecord.id);

    // Check if staff record exists for this phone (V3 path)
    const { data: staffRow } = await supabase
      .from('staff')
      .select('id, clinic_id, role, name, status, dentist_id')
      .eq('phone', phone)
      .eq('status', 'active')
      .single();

    if (staffRow) {
      // Returning user — fetch clinic and dentist data
      const { data: clinic } = await supabase.from('clinics').select('*').eq('id', staffRow.clinic_id).single();
      const { data: dentist } = staffRow.dentist_id
        ? await supabase.from('dentists').select('*').eq('id', staffRow.dentist_id).single()
        : { data: null };

      const token = signToken({
        dentistId: staffRow.dentist_id || staffRow.id,
        staffId:   staffRow.id,
        clinicId:  staffRow.clinic_id,
        role:      staffRow.role,
      });
      return res.json({ token, dentist: dentist || { id: staffRow.id, phone, name: staffRow.name }, staff: staffRow, clinic, isNewUser: false });
    }

    // Legacy dentist check (backward compat for existing users without staff row)
    const { data: dentist } = await supabase.from('dentists').select('*').eq('phone', phone).single();
    if (dentist) {
      // Try to find their auto-migrated staff row
      const { data: migratedStaff } = await supabase
        .from('staff').select('id, clinic_id, role').eq('dentist_id', dentist.id).single();
      if (migratedStaff) {
        const { data: clinic } = await supabase.from('clinics').select('*').eq('id', migratedStaff.clinic_id).single();
        const token = signToken({
          dentistId: dentist.id,
          staffId:   migratedStaff.id,
          clinicId:  migratedStaff.clinic_id,
          role:      migratedStaff.role,
        });
        return res.json({ token, dentist, staff: migratedStaff, clinic, isNewUser: false });
      }
      // dentist exists but no clinic yet (migration hasn't run)
      const token = signToken({ dentistId: dentist.id });
      return res.json({ token, dentist, isNewUser: false, needsClinic: true });
    }

    // Brand new user — no dentist, no staff
    // Create dentist row so JWT dentistId still works for legacy routes
    const { data: newDentist } = await supabase.from('dentists').insert({ phone }).select().single();
    const token = signToken({ dentistId: newDentist.id });
    res.json({ token, dentist: newDentist, isNewUser: true });
  } catch (e) { next(e); }
};

// ── create clinic (new user, first-time setup) ────────────────────────────────
exports.createClinic = async (req, res, next) => {
  try {
    const { clinicName, yourName, city } = req.body;
    if (!clinicName || !yourName) return res.status(400).json({ error: 'clinicName and yourName required' });

    const joinCode = await uniqueJoinCode();
    const displayId = makeDisplayId(city);

    // Create clinic
    const { data: clinic, error: ce } = await supabase.from('clinics').insert({
      name: clinicName, city: city || null, join_code: joinCode, display_id: displayId,
    }).select().single();
    if (ce) throw ce;

    // Create staff row
    const { data: staffRow, error: se } = await supabase.from('staff').insert({
      clinic_id: clinic.id,
      dentist_id: req.dentistId,
      phone: req.body.phone || '',
      name: yourName,
      role: 'doctor',
      status: 'active',
    }).select().single();
    if (se) throw se;

    // Update clinic owner
    await supabase.from('clinics').update({ owner_staff_id: staffRow.id }).eq('id', clinic.id);

    // Update dentist name/clinic if not set
    await supabase.from('dentists').update({ name: yourName, clinic_name: clinicName }).eq('id', req.dentistId);

    // Migrate existing patients/visits to this clinic
    await supabase.from('patients').update({ clinic_id: clinic.id }).eq('dentist_id', req.dentistId).is('clinic_id', null);
    await supabase.from('visits').update({ clinic_id: clinic.id }).eq('dentist_id', req.dentistId).is('clinic_id', null);
    await supabase.from('appointments').update({ clinic_id: clinic.id }).eq('dentist_id', req.dentistId).is('clinic_id', null);
    await supabase.from('treatment_plans').update({ clinic_id: clinic.id }).eq('dentist_id', req.dentistId).is('clinic_id', null);
    await supabase.from('prescriptions').update({ clinic_id: clinic.id }).eq('dentist_id', req.dentistId).is('clinic_id', null);
    await supabase.from('xrays').update({ clinic_id: clinic.id }).eq('dentist_id', req.dentistId).is('clinic_id', null);

    const token = signToken({ dentistId: req.dentistId, staffId: staffRow.id, clinicId: clinic.id, role: 'doctor' });
    const { data: dentist } = await supabase.from('dentists').select('*').eq('id', req.dentistId).single();
    res.json({ token, dentist, staff: staffRow, clinic: { ...clinic, owner_staff_id: staffRow.id } });
  } catch (e) { next(e); }
};

// ── join clinic (new user, entering join code) ────────────────────────────────
exports.lookupClinic = async (req, res, next) => {
  try {
    const { joinCode } = req.body;
    if (!joinCode) return res.status(400).json({ error: 'joinCode required' });
    const { data: clinic, error } = await supabase.from('clinics')
      .select('id, name, city, display_id').eq('join_code', joinCode.toUpperCase()).single();
    if (error || !clinic) return res.status(404).json({ error: 'Clinic not found. Check the join code.' });
    res.json({ clinic });
  } catch (e) { next(e); }
};

exports.joinClinic = async (req, res, next) => {
  try {
    const { joinCode, yourName, role } = req.body;
    if (!joinCode || !yourName || !role) return res.status(400).json({ error: 'joinCode, yourName, role required' });
    if (!['doctor', 'receptionist'].includes(role)) return res.status(400).json({ error: 'role must be doctor or receptionist' });

    const { data: clinic } = await supabase.from('clinics')
      .select('*').eq('join_code', joinCode.toUpperCase()).single();
    if (!clinic) return res.status(404).json({ error: 'Invalid join code' });

    // Get phone from dentist record
    const { data: dentist } = await supabase.from('dentists').select('*').eq('id', req.dentistId).single();

    const { data: staffRow, error: se } = await supabase.from('staff').insert({
      clinic_id: clinic.id,
      dentist_id: req.dentistId,
      phone: dentist?.phone || '',
      name: yourName,
      role,
      status: 'active',
    }).select().single();
    if (se) {
      // Already a member
      if (se.code === '23505') {
        const { data: existing } = await supabase.from('staff').select('*')
          .eq('clinic_id', clinic.id).eq('dentist_id', req.dentistId).single();
        const token = signToken({ dentistId: req.dentistId, staffId: existing.id, clinicId: clinic.id, role: existing.role });
        return res.json({ token, dentist, staff: existing, clinic });
      }
      throw se;
    }

    await supabase.from('dentists').update({ name: yourName, clinic_name: clinic.name }).eq('id', req.dentistId);

    const token = signToken({ dentistId: req.dentistId, staffId: staffRow.id, clinicId: clinic.id, role });
    res.json({ token, dentist: { ...dentist, name: yourName }, staff: staffRow, clinic });
  } catch (e) { next(e); }
};

// ── getMe — extended ──────────────────────────────────────────────────────────
exports.getMe = async (req, res, next) => {
  try {
    const { data: dentist } = await supabase.from('dentists').select('*').eq('id', req.dentistId).single();
    let staff = null, clinic = null;
    if (req.staffId) {
      const { data: s } = await supabase.from('staff').select('*').eq('id', req.staffId).single();
      staff = s;
    }
    if (req.clinicId) {
      const { data: c } = await supabase.from('clinics').select('*').eq('id', req.clinicId).single();
      clinic = c;
    }
    res.json({ dentist, staff, clinic });
  } catch (e) { next(e); }
};

// ── updateProfile ─────────────────────────────────────────────────────────────
exports.updateProfile = async (req, res, next) => {
  try {
    const { name, clinic_name, phone } = req.body;
    const { data: dentist, error } = await supabase.from('dentists')
      .update({ name, clinic_name, phone, updated_at: new Date().toISOString() })
      .eq('id', req.dentistId).select().single();
    if (error) throw error;
    if (req.staffId && name) {
      await supabase.from('staff').update({ name }).eq('id', req.staffId);
    }
    res.json({ dentist });
  } catch (e) { next(e); }
};
