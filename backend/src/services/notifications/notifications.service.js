// Persists a notification_logs row, calls the active provider, updates the row to
// sent/failed, and returns it. The provider is config-swappable; logging always happens.
const supabase = require('../../config/supabase');
const { getProvider } = require('./provider');

async function notify({ clinicId, staffId, patientId, type, channel = 'whatsapp', recipient, body, payload = {} }) {
  const provider = getProvider();
  const { data: row, error } = await supabase.from('notification_logs').insert({
    clinic_id: clinicId, patient_id: patientId || null, type, channel,
    recipient: recipient || null, payload: { ...payload, body }, status: 'queued',
    provider: provider.name, created_by: staffId || null,
  }).select().single();
  if (error) throw error;

  try {
    const { providerMessageId } = await provider.send({ to: recipient, channel, type, body });
    const { data: sent } = await supabase.from('notification_logs')
      .update({ status: 'sent', provider_message_id: providerMessageId, sent_at: new Date().toISOString() })
      .eq('id', row.id).select().single();
    return sent;
  } catch (e) {
    const { data: failed } = await supabase.from('notification_logs')
      .update({ status: 'failed', error: e.message || String(e) }).eq('id', row.id).select().single();
    return failed;
  }
}
module.exports = { notify };
