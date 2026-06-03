const supabase = require('../config/supabase');

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
    const { data: appointment, error } = await supabase.from('appointments')
      .update({ ...req.body, updated_at: new Date().toISOString() })
      .eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json({ appointment });
  } catch (e) { next(e); }
};
