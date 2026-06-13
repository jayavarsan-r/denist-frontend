// dentai-app/lib/documents/export.js
// One code path for fetching / viewing / sharing / downloading every clinical PDF.
// Native (Capacitor): write the PDF to the device and use the OS share sheet / file
// opener. Web: navigator.share({files}) with a WhatsApp / anchor-download fallback.
import { apiClient } from '@/lib/api/client';
import { Capacitor } from '@capacitor/core';
import { DOCUMENTS, docFilename } from './registry';

export async function fetchDocBlob(docType, id) {
  const def = DOCUMENTS[docType];
  if (!def) throw new Error(`Unknown document type: ${docType}`);
  const res = await apiClient.get(def.endpoint(id), { responseType: 'blob' });
  return res.data; // Blob (application/pdf)
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onloadend = () => resolve(String(r.result).split(',')[1]); // strip "data:...;base64,"
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

// Write to the device cache and return a file URI (native only).
async function writeCache(blob, filename) {
  const { Filesystem, Directory } = await import('@capacitor/filesystem');
  const data = await blobToBase64(blob);
  const { uri } = await Filesystem.writeFile({ path: filename, data, directory: Directory.Cache });
  return uri;
}

export async function viewDocument(blob, filename) {
  if (Capacitor.isNativePlatform()) {
    const uri = await writeCache(blob, filename);
    const { FileOpener } = await import('@capacitor-community/file-opener');
    await FileOpener.open({ filePath: uri, contentType: 'application/pdf' });
    return;
  }
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export async function shareDocument({ blob, filename, title, text, fallbackPhone }) {
  if (Capacitor.isNativePlatform()) {
    const uri = await writeCache(blob, filename);
    const { Share } = await import('@capacitor/share');
    await Share.share({ title, text, files: [uri] });
    return;
  }
  const file = new File([blob], filename, { type: 'application/pdf' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    await navigator.share({ files: [file], title, text });
    return;
  }
  // Desktop / unsupported: open WhatsApp to the patient (the user attaches the PDF).
  const phone = (fallbackPhone || '').replace(/\D/g, '').slice(-10);
  window.open(phone ? `https://wa.me/91${phone}` : 'https://wa.me/', '_blank');
}

export async function downloadDocument(blob, filename) {
  if (Capacitor.isNativePlatform()) {
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    const data = await blobToBase64(blob);
    await Filesystem.writeFile({ path: filename, data, directory: Directory.Documents });
    return { dir: 'Documents' };
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return { dir: 'downloads' };
}

export { docFilename };
