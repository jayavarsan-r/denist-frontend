const repos = require('../repositories');

const SELECT = '*, patients(id, name, phone)';
const scopeOf = (req) => ({ clinicId: req.clinicId, dentistId: req.dentistId });
const today = () => new Date().toISOString().split('T')[0];

exports.list = async (req, res, next) => {
  try {
    const { date, from, to } = req.query;
    let query = repos.appointments.query(scopeOf(req), SELECT)
      .neq('status', 'cancelled')                 // cancelled appts don't belong on the calendar
      .order('appointment_date').order('appointment_time');
    if (date) query = query.eq('appointment_date', date);
    if (from) query = query.gte('appointment_date', from);   // optional date-range (scales the calendar)
    if (to) query = query.lte('appointment_date', to);
    const { data, error } = await query;
    if (error) throw error;
    res.json({ appointments: data });
  } catch (e) { next(e); }
};

exports.today = async (req, res, next) => {
  try {
    const { data, error } = await repos.appointments.query(scopeOf(req), SELECT)
      .eq('appointment_date', today()).order('appointment_time');
    if (error) throw error;
    res.json({ appointments: data });
  } catch (e) { next(e); }
};

exports.upcoming = async (req, res, next) => {
  try {
    const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const { data, error } = await repos.appointments.query(scopeOf(req), SELECT)
      .gte('appointment_date', today()).lte('appointment_date', nextWeek)
      .order('appointment_date').order('appointment_time');
    if (error) throw error;
    res.json({ appointments: data });
  } catch (e) { next(e); }
};

exports.bookedSlots = async (req, res, next) => {
  try {
    const { date } = req.query;
    if (!date) return res.status(400).json({ error: 'date query param required' });
    const { data, error } = await repos.appointments.query(scopeOf(req), 'appointment_time')
      .eq('appointment_date', date).neq('status', 'cancelled');
    if (error) throw error;
    res.json({ bookedSlots: (data || []).map(a => a.appointment_time).filter(Boolean) });
  } catch (e) { next(e); }
};

exports.create = async (req, res, next) => {
  try {
    const { patientId, appointmentDate, appointmentTime, purpose, toothNumber, durationMinutes } = req.body;
    const base = {
      patient_id: patientId,
      dentist_id: req.dentistId,
      clinic_id: req.clinicId || null,
      appointment_date: appointmentDate,
      appointment_time: appointmentTime,
      purpose,
      tooth_number: toothNumber || null,
    };
    let appointment;
    try {
      // Prefer storing duration; fall back if migration 008 (duration_minutes) isn't applied yet.
      appointment = await repos.appointments.create({ ...base, duration_minutes: durationMinutes || 30 });
    } catch (e) {
      appointment = await repos.appointments.create(base);
    }
    res.status(201).json({ appointment });
  } catch (e) { next(e); }
};

exports.update = async (req, res, next) => {
  try {
    const fieldMap = {
      appointmentDate: 'appointment_date',
      appointmentTime: 'appointment_time',
      toothNumber: 'tooth_number',
      sittingNumber: 'sitting_number',
      durationMinutes: 'duration_minutes',
    };
    const allowed = new Set(['appointment_date', 'appointment_time', 'purpose', 'tooth_number', 'sitting_number', 'duration_minutes', 'status', 'notes']);
    const updates = {};
    for (const [k, v] of Object.entries(req.body)) {
      const col = fieldMap[k] || k;
      if (allowed.has(col)) updates[col] = v;
    }
    updates.updated_at = new Date().toISOString();

    const appointment = await repos.appointments.update(req.params.id, scopeOf(req), updates);
    if (!appointment) return res.status(404).json({ error: 'Appointment not found' });
    res.json({ appointment });
  } catch (e) { next(e); }
};
