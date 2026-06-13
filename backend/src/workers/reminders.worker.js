const supabase = require('../config/supabase');
const logger = require('../utils/logger');
const { getQueue, isQueueAvailable } = require('../jobs/queue');
const { notificationOrchestrator } = require('../services/notification-orchestrator.service');

const QUEUE_NAME = 'reminders';

// Appointment reminders: scheduled when an appointment is created (24h + 2h
// before), delivered through the orchestrator. The worker re-checks the
// appointment before sending — a cancelled/moved appointment self-cancels its
// stale reminders, same pattern as lab timeouts.
async function scheduleAppointmentReminders({ appointmentId, clinicId, patientId, appointmentDate, appointmentTime }) {
  try {
    if (!isQueueAvailable() || !appointmentDate) return;
    const when = new Date(`${appointmentDate}T${(appointmentTime || '10:00').slice(0, 5)}:00+05:30`);
    if (Number.isNaN(when.getTime())) return;

    const boss = getQueue();
    const base = { appointmentId, clinicId, patientId };
    const h24 = new Date(when.getTime() - 24 * 3600 * 1000);
    const h2 = new Date(when.getTime() - 2 * 3600 * 1000);
    if (h24 > new Date()) await boss.send(QUEUE_NAME, { ...base, type: '24h' }, { startAfter: h24 });
    if (h2 > new Date()) await boss.send(QUEUE_NAME, { ...base, type: '2h' }, { startAfter: h2 });
  } catch (e) {
    logger.warn('[reminders] scheduling failed (non-fatal)', { appointmentId, err: e.message });
  }
}

async function handleReminderJob({ appointmentId, clinicId, patientId, type }) {
  // Re-check: appointment must still exist, be upcoming, and not cancelled.
  const { data: appt } = await supabase.from('appointments')
    .select('id, status, appointment_date, appointment_time, patient_id')
    .eq('id', appointmentId).eq('clinic_id', clinicId).maybeSingle();
  if (!appt || ['cancelled', 'completed', 'no_show'].includes(appt.status)) return;

  await notificationOrchestrator.emit('appointment_reminder', {
    patientId: appt.patient_id || patientId, clinicId, appointmentId,
    date: appt.appointment_date, time: appt.appointment_time || '', type,
  });
}

async function registerRemindersWorker() {
  const boss = getQueue();
  await boss.createQueue(QUEUE_NAME);
  await boss.work(QUEUE_NAME, { batchSize: 1 }, async (jobs) => {
    for (const job of jobs) await handleReminderJob(job.data);
  });
  logger.info('[reminders.worker] registered');
}

module.exports = { registerRemindersWorker, scheduleAppointmentReminders, handleReminderJob, QUEUE_NAME };
