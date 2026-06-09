'use client';
import { useState, useRef, useCallback } from 'react';

/**
 * useAudioRecorder — wraps the browser MediaRecorder API.
 *
 * Returns:
 *   isRecording  boolean
 *   seconds      number (elapsed)
 *   startRecording()  → void
 *   stopRecording()   → Promise<Blob>  (audio/webm or audio/ogg)
 *   error        string | null
 */
export function useAudioRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState(null);

  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const resolveRef = useRef(null);

  const startRecording = useCallback(async () => {
    setError(null);
    setSeconds(0);
    chunksRef.current = [];

    try {
      // getUserMedia only exists on a secure origin (https or http://localhost).
      // On a LAN IP (http://192.168.x.x) the browser disables it and never prompts.
      if (!navigator.mediaDevices?.getUserMedia) {
        const msg = window.isSecureContext === false
          ? 'Microphone needs a secure connection — open the app at http://localhost:3000 (not the network IP).'
          : 'Microphone not supported in this browser.';
        setError(msg);
        throw new Error(msg);
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // A live mic yields an enabled, unmuted track. If it's muted/ended, the OS
      // is blocking capture (e.g. macOS Privacy → Microphone is off for this browser).
      const track = stream.getAudioTracks()[0];
      if (!track || track.readyState === 'ended' || track.muted) {
        stream.getTracks().forEach((t) => t.stop());
        const msg = 'Microphone is blocked. Enable it in System Settings → Privacy & Security → Microphone for your browser, then reload.';
        setError(msg);
        throw new Error(msg);
      }

      // Prefer OGG (Sarvam accepts it natively); fall back to webm which Sarvam v2 also handles
      const mimeType = ['audio/ogg;codecs=opus', 'audio/ogg', 'audio/webm;codecs=opus', 'audio/webm']
        .find((t) => MediaRecorder.isTypeSupported(t)) || '';

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        clearInterval(timerRef.current);
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        if (resolveRef.current) {
          resolveRef.current(blob);
          resolveRef.current = null;
        }
      };

      recorder.start(250); // collect data every 250 ms
      setIsRecording(true);

      timerRef.current = setInterval(() => {
        setSeconds((s) => s + 1);
      }, 1000);
    } catch (e) {
      let msg;
      if (e?.name === 'NotAllowedError' || e?.name === 'SecurityError') {
        msg = 'Microphone permission denied. Allow mic access for this site, and check System Settings → Privacy & Security → Microphone, then reload.';
      } else if (e?.name === 'NotFoundError' || e?.name === 'DevicesNotFoundError') {
        msg = 'No microphone found — connect a mic and reload.';
      } else if (e?.name === 'NotReadableError' || e?.name === 'TrackStartError') {
        msg = 'Microphone is in use by another app. Close it and try again.';
      } else {
        msg = e?.message || 'Could not access microphone';
      }
      setError(msg);
      throw new Error(msg);
    }
  }, []);

  const stopRecording = useCallback(() => {
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        setIsRecording(false);
        mediaRecorderRef.current.stop();
      } else {
        resolve(new Blob([], { type: 'audio/webm' }));
      }
    });
  }, []);

  return { isRecording, seconds, startRecording, stopRecording, error };
}
