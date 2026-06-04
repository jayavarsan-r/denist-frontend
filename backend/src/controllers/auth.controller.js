const supabase = require('../config/supabase');
const jwt = require('jsonwebtoken');
const { ok, fail } = require('../utils/response');

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

// ── send OTP ──────────────────────────────────────────────────────────────────
exports.sendOtp = async (req, res, next) => {
  try {
    const { phone } = req.body;
    if (!phone || !/^\d{10}$/.test(phone))
      return fail(res, 400, 'VALIDATION_ERROR', 'Valid 10-digit phone required');

    const isDemoPhone = process.env.DEMO_PHONE && phone === process.env.DEMO_PHONE;
    const otp = isDemoPhone
      ? (process.env.DEV_OTP || '012345')
      : (process.env.DEV_OTP_OTHER || Math.floor(100000 + Math.random() * 900000).toString());

    await supabase.from('otp_codes').delete().eq('phone', phone);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const { error } = await supabase.from('otp_codes').insert({ phone, code: otp, expires_at: expiresAt });
    if (error) throw error;
    return ok(res, { message: 'OTP sent' });
  } catch (e) { next(e); }
};

// ── verify OTP ─────────────────────────────────────────────────────────────────
exports.verifyOtp = async (req, res, next) => {
  try {
    const { phone, otp } = req.body;
    const { data: otpRecord } = await supabase.from('otp_codes')
      .select('*').eq('phone', phone).eq('code', otp).eq('used', false)
      .gt('expires_at', new Date().toISOString()).single();
    if (!otpRecord) return fail(res, 400, 'VALIDATION_ERROR', 'Invalid or expired OTP');
    await supabase.from('otp_codes').update({ used: true }).eq('id', otpRecord.id);

    // Check if staff record exists for this phone (V3 path)
    const { data: staffRow } = await supabase
      .from('staff')
      .select('id, clinic_id, role, name, status, dentist_id')
      .eq('phone', phone)
      .eq('status', 'active')
      .single();

    if (staffRow) {
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
      return ok(res, { token, dentist: dentist || { id: staffRow.id, phone, name: staffRow.name }, staff: staffRow, clinic, isNewUser: false });
    }

    // Legacy dentist check
    const { data: dentist } = await supabase.from('dentists').select('*').eq('phone', phone).single();
    if (dentist) {
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
        return ok(res, { token, dentist, staff: migratedStaff, clinic, isNewUser: false });
      }
      const token = signToken({ dentistId: dentist.id });
      return ok(res, { token, dentist, isNewUser: false, needsClinic: true });
    }

    // Brand new user
    const { data: newDentist } = await supabase.from('dentists').insert({ phone }).select().single();
    const token = signToken({ dentistId: newDentist.id });
    return ok(res, { token, dentist: newDentist, isNewUser: true });
  } catch (e) { next(e); }
};

// ── create clinic ──────────────────────────────────────────────────────────────
exports.createClinic = async (req, res, next) => {
  try {
    const { clinicName, yourName, city } = req.body;
    if (!clinicName || !yourName) return fail(res, 400, 'VALIDATION_ERROR', 'clinicName and yourName required');

    const joinCode = await uniqueJoinCode();
    const displayId = makeDisplayId(city);

    const { data: clinic, error: ce } = await supabase.from('clinics').insert({
      name: clinicName, city: city || null, join_code: joinCode, display_id: displayId,
    }).select().single();
    if (ce) throw ce;

    const { data: staffRow, error: se } = await supabase.from('staff').insert({
      clinic_id:  clinic.id,
      dentist_id: req.dentistId,
      phone:      req.body.phone || '',
      name:       yourName,
      role:       'doctor',
      status:     'active',
    }).select().single();
    if (se) throw se;

    await supabase.from('clinics').update({ owner_staff_id: staffRow.id }).eq('id', clinic.id);
    await supabase.from('dentists').update({ name: yourName, clinic_name: clinicName }).eq('id', req.dentistId);

    // Backfill clinic_id on all historical records for this dentist
    await supabase.from('patients').update({ clinic_id: clinic.id }).eq('dentist_id', req.dentistId).is('clinic_id', null);
    await supabase.from('visits').update({ clinic_id: clinic.id }).eq('dentist_id', req.dentistId).is('clinic_id', null);
    await supabase.from('appointments').update({ clinic_id: clinic.id }).eq('dentist_id', req.dentistId).is('clinic_id', null);
    await supabase.from('treatment_plans').update({ clinic_id: clinic.id }).eq('dentist_id', req.dentistId).is('clinic_id', null);
    await supabase.from('prescriptions').update({ clinic_id: clinic.id }).eq('dentist_id', req.dentistId).is('clinic_id', null);
    await supabase.from('xrays').update({ clinic_id: clinic.id }).eq('dentist_id', req.dentistId).is('clinic_id', null);

    const token = signToken({ dentistId: req.dentistId, staffId: staffRow.id, clinicId: clinic.id, role: 'doctor' });
    const { data: dentist } = await supabase.from('dentists').select('*').eq('id', req.dentistId).single();
    return ok(res, { token, dentist, staff: staffRow, clinic: { ...clinic, owner_staff_id: staffRow.id } });
  } catch (e) { next(e); }
};

// ── lookup clinic ──────────────────────────────────────────────────────────────
exports.lookupClinic = async (req, res, next) => {
  try {
    const { joinCode } = req.body;
    if (!joinCode) return fail(res, 400, 'VALIDATION_ERROR', 'joinCode required');
    const { data: clinic, error } = await supabase.from('clinics')
      .select('id, name, city, display_id').eq('join_code', joinCode.toUpperCase()).single();
    if (error || !clinic) return fail(res, 404, 'NOT_FOUND', 'Clinic not found. Check the join code.');
    return ok(res, { clinic });
  } catch (e) { next(e); }
};

// ── join clinic ────────────────────────────────────────────────────────────────
exports.joinClinic = async (req, res, next) => {
  try {
    const { joinCode, yourName, role } = req.body;
    if (!joinCode || !yourName || !role) return fail(res, 400, 'VALIDATION_ERROR', 'joinCode, yourName, role required');
    if (!['doctor', 'receptionist'].includes(role)) return fail(res, 400, 'VALIDATION_ERROR', 'role must be doctor or receptionist');

    const { data: clinic } = await supabase.from('clinics')
      .select('*').eq('join_code', joinCode.toUpperCase()).single();
    if (!clinic) return fail(res, 404, 'NOT_FOUND', 'Invalid join code');

    const { data: dentist } = await supabase.from('dentists').select('*').eq('id', req.dentistId).single();

    const { data: staffRow, error: se } = await supabase.from('staff').insert({
      clinic_id:  clinic.id,
      dentist_id: req.dentistId,
      phone:      dentist?.phone || '',
      name:       yourName,
      role,
      status:     'active',
    }).select().single();
    if (se) {
      if (se.code === '23505') {
        const { data: existing } = await supabase.from('staff').select('*')
          .eq('clinic_id', clinic.id).eq('dentist_id', req.dentistId).single();
        const token = signToken({ dentistId: req.dentistId, staffId: existing.id, clinicId: clinic.id, role: existing.role });
        return ok(res, { token, dentist, staff: existing, clinic });
      }
      throw se;
    }

    await supabase.from('dentists').update({ name: yourName, clinic_name: clinic.name }).eq('id', req.dentistId);
    const token = signToken({ dentistId: req.dentistId, staffId: staffRow.id, clinicId: clinic.id, role });
    return ok(res, { token, dentist: { ...dentist, name: yourName }, staff: staffRow, clinic });
  } catch (e) { next(e); }
};

// ── getMe — GET side-effect removed: join_code no longer generated here
// ── Use POST /api/clinic/regenerate-join-code (doctor only) for that
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
    return ok(res, { dentist, staff, clinic });
  } catch (e) { next(e); }
};

// ── updateProfile ──────────────────────────────────────────────────────────────
exports.updateProfile = async (req, res, next) => {
  try {
    const { name, clinic_name, phone } = req.body;
    const updates = { updated_at: new Date().toISOString() };
    if (name !== undefined) updates.name = name;
    if (clinic_name !== undefined) updates.clinic_name = clinic_name;
    // Note: phone update does not re-verify via OTP — user is already authenticated
    if (phone !== undefined) updates.phone = phone;
    const { data: dentist, error } = await supabase.from('dentists')
      .update(updates).eq('id', req.dentistId).select().single();
    if (error) throw error;
    if (req.staffId && name) {
      await supabase.from('staff').update({ name }).eq('id', req.staffId);
    }
    return ok(res, { dentist });
  } catch (e) { next(e); }
};
