const supabase = require('../config/supabase');
const { ok, okCreated, fail } = require('../utils/response');

exports.list = async (req, res, next) => {
  try {
    const { date } = req.query;
    let query = supabase.from('appointments')
      .select('*, patients(id, name, phone)')
      .eq('dentist_id', req.dentistId).order('appointment_time');
    if (date) query = query.eq('appointment_date', date);
    const { data, error } = await query;
    if (error) throw error;
    return ok(res, { appointments: data });
  } catch (e) { next(e); }
};

exports.today = async (req, res, next) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const { data, error } = await supabase.from('appointments')
      .select('*, patients(id, name, phone)')
      .eq('dentist_id', req.dentistId).eq('appointment_date', today).order('appointment_time');
    if (error) throw error;
    return ok(res, { appointments: data });
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
    return ok(res, { appointments: data });
  } catch (e) { next(e); }
};

exports.bookedSlots = async (req, res, next) => {
  try {
    const { date } = req.query;
    if (!date) return fail(res, 400, 'VALIDATION_ERROR', 'date query param required (YYYY-MM-DD)');
    const { data, error } = await supabase.from('appointments')
      .select('appointment_time')
      .eq('dentist_id', req.dentistId).eq('appointment_date', date).neq('status', 'cancelled');
    if (error) throw error;
    return ok(res, { bookedSlots: data.map(a => a.appointment_time) });
  } catch (e) { next(e); }
};

exports.create = async (req, res, next) => {
  try {
    const { patientId, appointmentDate, appointmentTime, purpose, toothNumber } = req.body;
    if (!patientId || !appointmentDate || !appointmentTime) {
      return fail(res, 400, 'VALIDATION_ERROR', 'patientId, appointmentDate, and appointmentTime are required');
    }
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
    return okCreated(res, { appointment });
  } catch (e) { next(e); }
};

exports.update = async (req, res, next) => {
  try {
    const { appointment_date, appointmentDate, appointment_time, appointmentTime,
            purpose, tooth_number, toothNumber, status } = req.body;
    const updates = { updated_at: new Date().toISOString() };
    if (appointment_date !== undefined) updates.appointment_date = appointment_date;
    if (appointmentDate !== undefined) updates.appointment_date = appointmentDate;
    if (appointment_time !== undefined) updates.appointment_time = appointment_time;
    if (appointmentTime !== undefined) updates.appointment_time = appointmentTime;
    if (purpose !== undefined) updates.purpose = purpose;
    if (tooth_number !== undefined) updates.tooth_number = tooth_number;
    if (toothNumber !== undefined) updates.tooth_number = toothNumber;
    const validStatuses = ['scheduled', 'completed', 'cancelled', 'no_show', 'suggested'];
    if (status !== undefined && validStatuses.includes(status)) updates.status = status;

    let uq = supabase.from('appointments').update(updates).eq('id', req.params.id)
      .eq('dentist_id', req.dentistId);
    const { data: appointment, error } = await uq.select().single();
    if (error || !appointment) return fail(res, 404, 'NOT_FOUND', 'Appointment not found or access denied');
    return ok(res, { appointment });
  } catch (e) { next(e); }
};
