const supabase = require('../config/supabase');

// Scope appointments to the caller: clinic-wide when clinic context exists,
// else fall back to owning dentist. OR covers legacy null-clinic rows.
function scopeQuery(query, req) {
  if (req.clinicId) {
    return query.or(`clinic_id.eq.${req.clinicId},dentist_id.eq.${req.dentistId}`);
  }
  return query.eq('dentist_id', req.dentistId);
}

exports.list = async (req, res, next) => {
  try {
    const { date } = req.query;
    let query = supabase.from('appointments')
      .select('*, patients(id, name, phone)')
      .eq('dentist_id', req.dentistId).order('appointment_time');
    if (date) query = query.eq('appointment_date', date);
    const { data, error } = await query;
    if (error) throw error;
    res.json({ appointments: data });
  } catch (e) { next(e); }
};

exports.today = async (req, res, next) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const { data, error } = await supabase.from('appointments')
      .select('*, patients(id, name, phone)')
      .eq('dentist_id', req.dentistId).eq('appointment_date', today).order('appointment_time');
    if (error) throw error;
    res.json({ appointments: data });
  } catch (e) { next(e); }
};

exports.upcoming = async (req, res, next) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const { data, error } = await supabase.from('appointments')
      .select('*, patients(id, name, phone)')
      .eq('dentist_id', req.dentistId)
      .gte('appointment_date', today).lte('appointment_date', nextWeek)
      .order('appointment_date').order('appointment_time');
    if (error) throw error;
    res.json({ appointments: data });
  } catch (e) { next(e); }
};

exports.bookedSlots = async (req, res, next) => {
  try {
    const { date } = req.query;
    const { data, error } = await supabase.from('appointments')
      .select('appointment_time')
      .eq('dentist_id', req.dentistId).eq('appointment_date', date).neq('status', 'cancelled');
    if (error) throw error;
    res.json({ bookedSlots: data.map(a => a.appointment_time) });
  } catch (e) { next(e); }
};

exports.create = async (req, res, next) => {
  try {
    const { patientId, appointmentDate, appointmentTime, purpose, toothNumber } = req.body;
    const { data: appointment, error } = await supabase.from('appointments').insert({
      patient_id: patientId,
      dentist_id: req.dentistId,
      clinic_id: req.clinicId || null,
      appointment_date: appointmentDate,
      appointment_time: appointmentTime,
      purpose,
      tooth_number: toothNumber || null,
    }).select().single();
    if (error) throw error;
    res.status(201).json({ appointment });
  } catch (e) { next(e); }
};

exports.update = async (req, res, next) => {
  try {
    // Whitelist updatable fields — never spread req.body (prevents overwriting
    // dentist_id/clinic_id/patient_id and other ownership columns).
    const fieldMap = {
      appointmentDate: 'appointment_date',
      appointmentTime: 'appointment_time',
      toothNumber: 'tooth_number',
      sittingNumber: 'sitting_number',
    };
    const allowed = new Set([
      'appointment_date', 'appointment_time', 'purpose', 'tooth_number',
      'sitting_number', 'status', 'notes',
    ]);
    const updates = {};
    for (const [k, v] of Object.entries(req.body)) {
      const col = fieldMap[k] || k;
      if (allowed.has(col)) updates[col] = v;
    }
    updates.updated_at = new Date().toISOString();

    let uq = supabase.from('appointments').update(updates).eq('id', req.params.id);
    uq = scopeQuery(uq, req);
    const { data: appointment, error } = await uq.select().single();
    if (error || !appointment) return res.status(404).json({ error: 'Appointment not found' });
    res.json({ appointment });
  } catch (e) { next(e); }
};
