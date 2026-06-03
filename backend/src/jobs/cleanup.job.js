const supabase = require('../config/supabase');
const { deleteFile } = require('../services/storage.service');

async function runAudioCleanup(retentionMonths = 18) {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - retentionMonths);

  const { data } = await supabase
    .from('visit_notes')
    .select('id, audio_storage_path, audio_file_size_kb')
    .not('audio_storage_path', 'is', null)
    .lt('audio_uploaded_at', cutoff.toISOString())
    .limit(100);

  if (!data || data.length === 0) return;

  let freed = 0;
  for (const n of data) {
    try {
      await deleteFile('voice-notes', n.audio_storage_path);
      await supabase.from('visit_notes').update({ audio_storage_path: null }).eq('id', n.id);
      freed += n.audio_file_size_kb || 0;
    } catch (e) { console.error(`[Cleanup] Failed ${n.id}:`, e.message); }
  }
  console.log(`[Cleanup] Freed ~${(freed / 1024).toFixed(1)} MB`);
}

module.exports = { runAudioCleanup };
