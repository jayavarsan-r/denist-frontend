const supabase = require('../config/supabase');

// Return patients visible to this user:
// - patients in the same clinic (clinic_id matches), OR
// - patients directly owned by this dentist (covers legacy null-clinic records)
function scopeQuery(query, req) {
  if (req.clinicId) {
    return query.or(`clinic_id.eq.${req.clinicId},dentist_id.eq.${req.dentistId}`);
  }
  return query.eq('dentist_id', req.dentistId);
}

exports.list = async (req, res, next) => {
  try {
    const { q } = req.query;
    // Backfill clinic_id for any patients created before multi-staff support
    if (req.clinicId && req.dentistId) {
      await supabase.from('patients')
        .update({ clinic_id: req.clinicId })
        .eq('dentist_id', req.dentistId)
        .is('clinic_id', null);
    }
    let query = supabase.from('patients')
      .select('*, visits(id, visit_date, procedure_name, status, follow_up_date), appointments(id, appointment_date, appointment_time, status)')
      .eq('is_deleted', false).order('name');
    // Scope to clinic when available (all staff see the same patients), else fall back to dentist
    if (req.clinicId) query = query.eq('clinic_id', req.clinicId);
    else query = query.eq('dentist_id', req.dentistId);
    if (q) query = query.or(`name.ilike.%${q}%,phone.ilike.%${q}%`);
    const { data, error } = await query;
    if (error) throw error;
    res.json({ patients: data });
  } catch (e) { next(e); }
};

exports.create = async (req, res, next) => {
  try {
    const { name, phone, age, gender, medical_conditions, allergies, clinical_flags } = req.body;
    if (!name || !phone) return res.status(400).json({ error: 'Name and phone required' });
    const { data: patient, error } = await supabase.from('patients')
      .insert({ dentist_id: req.dentistId, clinic_id: req.clinicId || null, name, phone, age, gender, medical_conditions, allergies, clinical_flags })
      .select().single();
    if (error) throw error;
    res.status(201).json({ patient });
  } catch (e) { next(e); }
};

exports.getById = async (req, res, next) => {
  try {
    let q = supabase.from('patients').select('*, visits(*), appointments(*)').eq('id', req.params.id);
    q = scopeQuery(q, req);
    const { data: patient, error } = await q.single();
    if (error || !patient) return res.status(404).json({ error: 'Patient not found' });
    // Stamp clinic_id if missing so future scope queries find this patient
    if (req.clinicId && !patient.clinic_id) {
      supabase.from('patients').update({ clinic_id: req.clinicId }).eq('id', req.params.id).then(() => {});
    }
    res.json({ patient });
  } catch (e) { next(e); }
};

exports.update = async (req, res, next) => {
  try {
    // Whitelist editable fields — never spread req.body (prevents overwriting
    // dentist_id/clinic_id/is_deleted and other protected columns).
    const allowed = ['name', 'phone', 'age', 'gender', 'medical_conditions', 'allergies', 'clinical_flags'];
    const updates = { updated_at: new Date().toISOString() };
    for (const k of allowed) {
      if (req.body[k] !== undefined) updates[k] = req.body[k];
    }
    let uq = supabase.from('patients').update(updates).eq('id', req.params.id);
    if (req.clinicId) uq = uq.eq('clinic_id', req.clinicId);
    else uq = uq.eq('dentist_id', req.dentistId);
    const { data: patient, error } = await uq.select().single();
    if (error) throw error;
    res.json({ patient });
  } catch (e) { next(e); }
};

exports.remove = async (req, res, next) => {
  try {
    let dq = supabase.from('patients').update({ is_deleted: true }).eq('id', req.params.id);
    if (req.clinicId) dq = dq.eq('clinic_id', req.clinicId);
    else dq = dq.eq('dentist_id', req.dentistId);
    const { error } = await dq;
    if (error) throw error;
    res.json({ success: true });
  } catch (e) { next(e); }
};
