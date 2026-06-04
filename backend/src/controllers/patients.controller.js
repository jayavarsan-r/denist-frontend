const supabase = require('../config/supabase');
const { ok, okCreated, fail } = require('../utils/response');

function scopeQuery(query, req) {
  if (req.clinicId) {
    return query.or(`clinic_id.eq.${req.clinicId},dentist_id.eq.${req.dentistId}`);
  }
  return query.eq('dentist_id', req.dentistId);
}

exports.list = async (req, res, next) => {
  try {
    const { q } = req.query;
    let query = supabase.from('patients')
      .select('*, visits(id, visit_date, procedure_name, status, follow_up_date), appointments(id, appointment_date, appointment_time, status)')
      .eq('is_deleted', false).order('name');
    if (req.clinicId) query = query.eq('clinic_id', req.clinicId);
    else query = query.eq('dentist_id', req.dentistId);
    if (q) query = query.or(`name.ilike.%${q}%,phone.ilike.%${q}%`);
    const { data, error } = await query;
    if (error) throw error;
    return ok(res, { patients: data });
  } catch (e) { next(e); }
};

exports.create = async (req, res, next) => {
  try {
    const { name, phone, age, gender, medical_conditions, allergies, clinical_flags } = req.body;
    if (!name || !phone) return fail(res, 400, 'VALIDATION_ERROR', 'Name and phone required');
    const { data: patient, error } = await supabase.from('patients')
      .insert({ dentist_id: req.dentistId, clinic_id: req.clinicId || null, name, phone, age, gender, medical_conditions, allergies, clinical_flags: clinical_flags || null })
      .select().single();
    if (error) throw error;
    return okCreated(res, { patient });
  } catch (e) { next(e); }
};

exports.getById = async (req, res, next) => {
  try {
    let q = supabase.from('patients').select('*, visits(*), appointments(*)').eq('id', req.params.id);
    q = scopeQuery(q, req);
    const { data: patient, error } = await q.single();
    if (error || !patient) return fail(res, 404, 'NOT_FOUND', 'Patient not found');
    return ok(res, { patient });
  } catch (e) { next(e); }
};

exports.update = async (req, res, next) => {
  try {
    const { name, phone, age, gender, medical_conditions, allergies, clinical_flags } = req.body;
    const updates = { updated_at: new Date().toISOString() };
    if (name !== undefined) updates.name = name;
    if (phone !== undefined) updates.phone = phone;
    if (age !== undefined) updates.age = age;
    if (gender !== undefined) updates.gender = gender;
    if (medical_conditions !== undefined) updates.medical_conditions = medical_conditions;
    if (allergies !== undefined) updates.allergies = allergies;
    if (clinical_flags !== undefined) updates.clinical_flags = clinical_flags;
    let uq = supabase.from('patients').update(updates).eq('id', req.params.id);
    if (req.clinicId) uq = uq.eq('clinic_id', req.clinicId);
    else uq = uq.eq('dentist_id', req.dentistId);
    const { data: patient, error } = await uq.select().single();
    if (error) throw error;
    return ok(res, { patient });
  } catch (e) { next(e); }
};

exports.remove = async (req, res, next) => {
  try {
    let dq = supabase.from('patients').update({ is_deleted: true }).eq('id', req.params.id);
    if (req.clinicId) dq = dq.eq('clinic_id', req.clinicId);
    else dq = dq.eq('dentist_id', req.dentistId);
    const { error } = await dq;
    if (error) throw error;
    return ok(res, { success: true });
  } catch (e) { next(e); }
};
