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
    let query = scopeQuery(
      supabase.from('patients')
        .select('*, visits(id, visit_date, procedure_name, status, follow_up_date), appointments(id, appointment_date, appointment_time, status)')
        .eq('is_deleted', false)
        .order('name'),
      req
    );
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
      .insert({
        dentist_id: req.dentistId,
        clinic_id: req.clinicId || null,
        name, phone, age, gender, medical_conditions, allergies, clinical_flags,
      })
      .select().single();
    if (error) throw error;
    res.status(201).json({ patient });
  } catch (e) { next(e); }
};

exports.getById = async (req, res, next) => {
  try {
    const { data: patient, error } = await scopeQuery(
      supabase.from('patients').select('*, visits(*), appointments(*)').eq('id', req.params.id),
      req
    ).single();
    if (error || !patient) return res.status(404).json({ error: 'Patient not found' });
    res.json({ patient });
  } catch (e) { next(e); }
};

exports.update = async (req, res, next) => {
  try {
    const { data: patient, error } = await scopeQuery(
      supabase.from('patients').update({ ...req.body, updated_at: new Date().toISOString() }).eq('id', req.params.id),
      req
    ).select().single();
    if (error) throw error;
    res.json({ patient });
  } catch (e) { next(e); }
};

exports.remove = async (req, res, next) => {
  try {
    const { error } = await scopeQuery(
      supabase.from('patients').update({ is_deleted: true }).eq('id', req.params.id),
      req
    );
    if (error) throw error;
    res.json({ success: true });
  } catch (e) { next(e); }
};
