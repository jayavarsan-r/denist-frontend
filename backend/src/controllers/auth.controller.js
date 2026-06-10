const supabase = require('../config/supabase');
const jwt = require('jsonwebtoken');
const transaction = require('../services/transaction.service');

function signToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '30d' });
}

// Resolve a REAL dentists.id for the authenticated request. Stale or cross-backend
// tokens (and an older buggy fallback) can carry a dentistId that is actually a staff
// id, which violates staff_dentist_id_fkey when inserting a staff row. Reuse a dentist
// matching the user's phone, else create one. Returns a guaranteed-valid dentist id.
async function ensureDentistId(req, { name } = {}) {
  const claimed = req.dentistId;
  if (claimed) {
    const { data } = await supabase.from('dentists').select('id').eq('id', claimed).single();
    if (data) return claimed;
  }
  // Find the user's phone via their staff row (token staffId), if any.
  let phone = null;
  if (req.staffId) {
    const { data: s } = await supabase.from('staff').select('phone').eq('id', req.staffId).single();
    phone = s?.phone || null;
  }
  if (phone) {
    const { data: byPhone } = await supabase.from('dentists').select('id').eq('phone', phone).single();
    if (byPhone) return byPhone.id;
  }
  const { data: created } = await supabase.from('dentists').insert({ phone, name: name || null }).select('id').single();
  return created.id;
}

// ── send OTP (unchanged) ──────────────────────────────────────────────────────
exports.sendOtp = async (req, res, next) => {
  try {
    const { phone } = req.body;
    if (!phone || !/^\d{10}$/.test(phone))
      return fail(res, 400, 'VALIDATION_ERROR', 'Valid 10-digit phone required');

    // USE_DEV_OTP=true pins all phones to DEV_OTP (local dev only)
    const useDevOtp = process.env.USE_DEV_OTP === 'true' && process.env.DEV_OTP;
    const isDemoPhone = process.env.DEMO_PHONE && phone === process.env.DEMO_PHONE;
    const otp = (useDevOtp || isDemoPhone)
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
      // Returning user — fetch clinic and dentist data.
      // Self-heal legacy staff rows whose dentist_id is null or dangling: using
      // staffRow.id as the dentistId (the old fallback) poisons the JWT and breaks
      // any insert that FKs into dentists (e.g. create-clinic → staff_dentist_id_fkey).
      // Resolve a REAL dentist — reuse one matching this phone, else create one —
      // and persist the link so the row is fixed for good.
      let dentistId = staffRow.dentist_id;
      let dentist = null;
      if (dentistId) {
        const { data } = await supabase.from('dentists').select('*').eq('id', dentistId).single();
        dentist = data;
      }
      if (!dentist) {
        const { data: existing } = await supabase.from('dentists').select('*').eq('phone', phone).single();
        if (existing) {
          dentist = existing;
        } else {
          const { data: created } = await supabase.from('dentists').insert({ phone, name: staffRow.name || null }).select('*').single();
          dentist = created;
        }
        dentistId = dentist.id;
        await supabase.from('staff').update({ dentist_id: dentistId }).eq('id', staffRow.id);
        staffRow.dentist_id = dentistId;
      }

      const { data: clinic } = await supabase.from('clinics').select('*').eq('id', staffRow.clinic_id).single();

      const token = signToken({
        dentistId,
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
    const { clinicName, yourName, city, phone } = req.body;
    if (!clinicName || !yourName) return res.status(400).json({ error: 'clinicName and yourName required' });

    // Heal the dentistId before inserting staff (see ensureDentistId). The new token
    // returned below carries the corrected dentistId, so the client session self-repairs.
    const dentistId = await ensureDentistId(req, { name: yourName });

    const { clinic, staff } = await transaction.createClinic({
      dentistId, requestId: req.id,
      clinicName, yourName, city, phone: phone || '',
    });

    const token = signToken({ dentistId, staffId: staff.id, clinicId: clinic.id, role: 'doctor' });
    const { data: dentist } = await supabase.from('dentists').select('*').eq('id', dentistId).single();
    res.json({ token, dentist, staff, clinic });
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

    // Heal the dentistId before inserting the staff row (same FK hazard as createClinic).
    const dentistId = await ensureDentistId(req, { name: yourName });

    const result = await transaction.joinClinic({ dentistId, requestId: req.id, joinCode, yourName, role });
    if (result.error === 'NOT_FOUND') return res.status(404).json({ error: 'Invalid join code' });

    const { clinic, staff, dentist } = result;
    const token = signToken({ dentistId, staffId: staff.id, clinicId: clinic.id, role: staff.role });
    res.json({ token, dentist, staff, clinic });
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
      // (Removed) join_code generation side-effect on GET /me. Use
      // POST /api/clinic/regenerate-join-code instead.
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
