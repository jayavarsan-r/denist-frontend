const supabase = require('../config/supabase');

exports.list = async (req, res, next) => {
  try {
    const { q } = req.query;
    let query = supabase.from('patients')
      .select('*, visits(id, visit_date, procedure_name, status, follow_up_date), appointments(id, appointment_date, appointment_time, status)')
      .eq('dentist_id', req.dentistId).eq('is_deleted', false).order('name');
    if (q) query = query.or(`name.ilike.%${q}%,phone.ilike.%${q}%`);
    const { data, error } = await query;
    if (error) throw error;
    res.json({ patients: data });
  } catch (e) { next(e); }
};

exports.create = async (req, res, next) => {
  try {
    const { name, phone, age, gender, medical_conditions, allergies } = req.body;
    if (!name || !phone) return res.status(400).json({ error: 'Name and phone required' });
    const { data: patient, error } = await supabase.from('patients')
      .insert({ dentist_id: req.dentistId, name, phone, age, gender, medical_conditions, allergies })
      .select().single();
    if (error) throw error;
    res.status(201).json({ patient });
  } catch (e) { next(e); }
};

exports.getById = async (req, res, next) => {
  try {
    const { data: patient, error } = await supabase.from('patients')
      .select('*, visits(*), appointments(*)')
      .eq('id', req.params.id).eq('dentist_id', req.dentistId).single();
    if (error || !patient) return res.status(404).json({ error: 'Patient not found' });
    res.json({ patient });
  } catch (e) { next(e); }
};

exports.update = async (req, res, next) => {
  try {
    const { data: patient, error } = await supabase.from('patients')
      .update({ ...req.body, updated_at: new Date().toISOString() })
      .eq('id', req.params.id).eq('dentist_id', req.dentistId).select().single();
    if (error) throw error;
    res.json({ patient });
  } catch (e) { next(e); }
};

exports.remove = async (req, res, next) => {
  try {
    const { error } = await supabase.from('patients')
      .update({ is_deleted: true }).eq('id', req.params.id).eq('dentist_id', req.dentistId);
    if (error) throw error;
    res.json({ success: true });
  } catch (e) { next(e); }
};
