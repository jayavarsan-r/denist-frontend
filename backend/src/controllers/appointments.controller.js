const repos = require('../repositories');
const supabase = require('../config/supabase');
const { overlaps } = require('../utils/slot-overlap');
const { conflict } = require('../utils/errors');
const { ok, fail } = require('../utils/response');

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
    return ok(res, { appointments: data });
  } catch (e) { next(e); }
};

exports.today = async (req, res, next) => {
  try {
    const { data, error } = await repos.appointments.query(scopeOf(req), SELECT)
      .eq('appointment_date', today()).order('appointment_time');
    if (error) throw error;
    return ok(res, { appointments: data });
  } catch (e) { next(e); }
};

exports.upcoming = async (req, res, next) => {
  try {
    const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const { data, error } = await repos.appointments.query(scopeOf(req), SELECT)
      .gte('appointment_date', today()).lte('appointment_date', nextWeek)
      .order('appointment_date').order('appointment_time');
    if (error) throw error;
    return ok(res, { appointments: data });
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
    const { patientId, appointmentDate, appointmentTime, purpose, toothNumber, durationMinutes, allowDoubleBook } = req.body;
    const dur = durationMinutes || 30;

    // Conflict detection: same clinic + date, overlapping [time, time+duration).
    // Date-only suggestions (no time) never conflict. `allowDoubleBook` bypasses.
    if (appointmentTime && !allowDoubleBook && req.clinicId) {
      const { data: sameDay, error: sameDayErr } = await supabase.from('appointments')
        .select('id, appointment_time, duration_minutes, purpose, patients(name)')
        .eq('clinic_id', req.clinicId).eq('appointment_date', appointmentDate)
        .neq('status', 'cancelled');
      if (sameDayErr) throw sameDayErr;
      const clash = (sameDay || []).find(a => overlaps(appointmentTime, dur, a.appointment_time, a.duration_minutes || 30));
      if (clash) {
        throw conflict('Time slot already booked', {
          id: clash.id, time: clash.appointment_time, purpose: clash.purpose,
          patientName: clash.patients?.name || null,
        });
      }
    }

    const base = {
      patient_id: patientId, dentist_id: req.dentistId, clinic_id: req.clinicId || null,
      appointment_date: appointmentDate, appointment_time: appointmentTime,
      purpose, tooth_number: toothNumber || null,
    };
    let appointment;
    try {
      appointment = await repos.appointments.create({ ...base, duration_minutes: dur });
    } catch (e) {
      appointment = await repos.appointments.create(base);
    }

    // 24h + 2h WhatsApp reminders (non-fatal; worker re-checks before sending).
    try {
      const { scheduleAppointmentReminders } = require('../workers/reminders.worker');
      await scheduleAppointmentReminders({
        appointmentId: appointment.id, clinicId: req.clinicId, patientId,
        appointmentDate, appointmentTime,
      });
    } catch { /* reminders must never block booking */ }

    res.status(201).json({ appointment });
  } catch (e) { next(e); }
};

exports.createRecurring = async (req, res, next) => {
  try {
    if (!req.clinicId) return res.status(403).json({ error: 'No clinic context' });
    const { patientId, startDate, intervalDays, count, purpose, appointmentTime, durationMinutes, allowDoubleBook } = req.body;
    const dur = durationMinutes || 30;
    const dates = require('../utils/recurrence').buildSchedule(startDate, intervalDays, count);

    let existing = [];
    if (appointmentTime && !allowDoubleBook) {
      const { data, error } = await supabase.from('appointments')
        .select('appointment_date, appointment_time, duration_minutes')
        .eq('clinic_id', req.clinicId).in('appointment_date', dates).neq('status', 'cancelled');
      if (error) throw error;
      existing = data || [];
    }

    const created = [], skipped = [];
    for (const date of dates) {
      if (appointmentTime && !allowDoubleBook) {
        const clash = existing.find(a => a.appointment_date === date &&
          overlaps(appointmentTime, dur, a.appointment_time, a.duration_minutes || 30));
        if (clash) { skipped.push({ date, reason: 'conflict' }); continue; }
      }
      const base = {
        patient_id: patientId, dentist_id: req.dentistId, clinic_id: req.clinicId,
        appointment_date: date, appointment_time: appointmentTime || null,
        purpose: purpose || 'Recurring visit', status: 'scheduled',
      };
      let row;
      try { row = await repos.appointments.create({ ...base, duration_minutes: dur }); }
      catch { row = await repos.appointments.create(base); }
      created.push(row);
      if (appointmentTime) existing.push({ appointment_date: date, appointment_time: appointmentTime, duration_minutes: dur });
    }
    res.status(201).json({ created, skipped });
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
