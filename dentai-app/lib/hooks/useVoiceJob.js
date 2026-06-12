'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { subscribeToDraft } from '@/lib/realtime';
import { startVoice } from '@/lib/services/queue.service';
import { startPatientVoice, getDraft } from '@/lib/services/ai.service';

const blobFilename = (blob) => {
  const t = blob?.type || '';
  return t.includes('mp4') || t.includes('mpeg') ? 'recording.mp4'
    : t.includes('ogg') ? 'recording.ogg' : 'recording.webm';
};

/**
 * useVoiceJob — the async voice pipeline, from the client's side.
 *
 *   const { state, draft, error, submitRecording, reset } = useVoiceJob({ queueEntryId })
 *   const { ... } = useVoiceJob({ patientId })   // profile consult, no queue entry
 *
 * state: idle | uploading | processing | draft_ready | error
 *
 * submitRecording(blob) uploads the audio; the backend answers immediately with a
 * draft_id and a worker does STT → extraction → safety checks. We subscribe to
 * that draft row via Supabase Realtime and ALSO poll every 5s (same belt-and-
 * braces pattern as useQueueRealtime) so a dropped websocket can't strand the
 * doctor on "Analysing…".
 */
export function useVoiceJob({ queueEntryId = null, patientId = null } = {}) {
  const [state, setState] = useState('idle');
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState(null);
  const [draftId, setDraftId] = useState(null);
  const unsubRef = useRef(null);
  const pollRef = useRef(null);

  const stopWatching = useCallback(() => {
    if (unsubRef.current) { unsubRef.current(); unsubRef.current = null; }
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  const handleDraftRow = useCallback((row) => {
    if (!row) return;
    if (row.status === 'pending_review') {
      stopWatching();
      setDraft(row);
      setState('draft_ready');
    } else if (row.status === 'error') {
      stopWatching();
      setError(humanError(row.error_code));
      setState('error');
    }
  }, [stopWatching]);

  // Watch the draft row: realtime push + 5s polling fallback.
  useEffect(() => {
    if (!draftId) return undefined;
    let cancelled = false;

    subscribeToDraft(draftId, handleDraftRow).then((unsub) => {
      if (cancelled) { unsub(); return; }
      unsubRef.current = unsub;
    });
    pollRef.current = setInterval(async () => {
      try { handleDraftRow(await getDraft(draftId)); } catch { /* keep polling */ }
    }, 5000);

    return () => { cancelled = true; stopWatching(); };
  }, [draftId, handleDraftRow, stopWatching]);

  const submitRecording = useCallback(async (audioBlob) => {
    setError(null);
    if (!audioBlob || audioBlob.size < 500) {
      setError('Recording too short — please try again');
      setState('error');
      return null;
    }
    setState('uploading');
    try {
      const filename = blobFilename(audioBlob);
      const res = queueEntryId
        ? await startVoice(queueEntryId, audioBlob, filename)
        : await startPatientVoice(patientId, audioBlob, filename);
      setDraftId(res.draft_id);
      setState('processing');
      return res.draft_id;
    } catch (e) {
      setError(e?.apiError?.message || e?.message || 'Could not start processing');
      setState('error');
      return null;
    }
  }, [queueEntryId, patientId]);

  const reset = useCallback(() => {
    stopWatching();
    setState('idle');
    setDraft(null);
    setError(null);
    setDraftId(null);
  }, [stopWatching]);

  return { state, draft, draftId, error, submitRecording, reset };
}

function humanError(code) {
  switch (code) {
    case 'STT_UNAVAILABLE': return "Couldn't transcribe the recording — please re-record";
    case 'STT_EMPTY':       return "Couldn't hear anything — please re-record closer to the mic";
    case 'LLM_UNAVAILABLE':
    case 'RATE_LIMITED':    return 'AI is busy right now — try again in a moment';
    case 'EXTRACTION_FAILED': return "Couldn't structure the note — re-record or enter manually";
    default: return 'Processing failed — please re-record';
  }
}
