import { Capacitor } from '@capacitor/core';

// Ask for the permissions the app needs — once, right after login — so the doctor can
// immediately use voice (mic), capture X-rays (camera), and attach reports (files/photos)
// without hitting a permission wall mid-task. Order: files/photos → camera → microphone.
//
// Native (Android/iOS) only; on the web each browser API prompts on first use anyway.
// Every step is best-effort and isolated: a denied or unavailable permission never throws
// and never blocks the next prompt or the app.
let primed = false;

export async function primePermissions() {
  if (primed) return;
  if (!Capacitor?.isNativePlatform?.()) return; // web: skip — browser prompts on use
  primed = true;

  // 1) Files/photos, then camera — native runtime prompts via the Camera plugin.
  try {
    const { Camera } = await import('@capacitor/camera');
    try { await Camera.requestPermissions({ permissions: ['photos'] }); } catch { /* denied/unavailable */ }
    try { await Camera.requestPermissions({ permissions: ['camera'] }); } catch { /* denied/unavailable */ }
  } catch { /* plugin unavailable */ }

  // 2) Microphone — the voice features depend on it. getUserMedia triggers the native
  //    RECORD_AUDIO prompt inside the Capacitor WebView; release the track immediately.
  try {
    const stream = await navigator.mediaDevices?.getUserMedia({ audio: true });
    stream?.getTracks().forEach((t) => t.stop());
  } catch { /* denied/unavailable */ }
}
