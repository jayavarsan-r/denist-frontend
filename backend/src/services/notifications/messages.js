// Pure WhatsApp/SMS body builders. No I/O — fully unit-testable.
function buildPrescriptionMessage(patient, medicines = []) {
  const lines = (medicines || []).map(m =>
    `• ${m.name || 'Medicine'}${m.frequency ? ` — ${m.frequency}` : ''}${m.duration ? ` (${m.duration})` : ''}`);
  const body = lines.length ? lines.join('\n') : 'No medicines were prescribed.';
  return `Hi ${patient?.name || 'there'}, here is your prescription from the clinic:\n${body}\n\nPlease follow the dosage as advised.`;
}
function buildReminderMessage(patient, appt) {
  return `Hi ${patient?.name || 'there'}, this is a reminder for your appointment on ${appt?.appointment_date || ''}` +
    `${appt?.appointment_time ? ` at ${appt.appointment_time}` : ''}` +
    `${appt?.purpose ? ` (${appt.purpose})` : ''}. See you soon!`;
}
function buildPaymentDueMessage(patient, amount) {
  return `Hi ${patient?.name || 'there'}, you have a pending balance of ₹${amount} at the clinic. Kindly clear it at your next visit. Thank you.`;
}
function buildRecallMessage(patient, dueDate, reason) {
  return `Hi ${patient?.name || 'there'}, it's time for your ${reason || 'review'} on ${dueDate}. Please book a slot at your convenience.`;
}
module.exports = { buildPrescriptionMessage, buildReminderMessage, buildPaymentDueMessage, buildRecallMessage };
