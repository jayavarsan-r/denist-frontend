'use client';
import { useState, useCallback } from 'react';
import { transcribeAudio } from '@/lib/services/ai.service';

/**
 * useTranscription
 * Returns:
 *   transcribe(blob) → Promise<{ text: string, warning?: string }>
 *   loading  boolean
 *   error    string | null
 */
export function useTranscription(recordingType = 'general') {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const transcribe = useCallback(async (blob) => {
    setLoading(true);
    setError(null);
    try {
      if (!blob || blob.size < 500) {
        setLoading(false);
        return { text: '', warning: 'Recording too short — please try again' };
      }
      const ext = blob.type.includes('ogg') ? 'ogg'
        : blob.type.includes('mp4') || blob.type.includes('mpeg') ? 'm4a'
        : blob.type.includes('wav') ? 'wav'
        : 'webm';
      const data = await transcribeAudio(blob, `recording.${ext}`);
      setLoading(false);
      return {
        text: data.transcript || '',
        warning: data.warning || null,
        audioStoragePath: data.audioStoragePath || null,
        audioFileSizeKb: data.audioFileSizeKb || null,
      };
    } catch (e) {
      const msg = e?.apiError?.message || e?.message || 'Transcription failed';
      setError(msg);
      setLoading(false);
      return { text: '', warning: msg };
    }
  }, []);

  return { transcribe, loading, error };
}
