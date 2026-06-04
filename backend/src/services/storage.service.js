const supabase = require('../config/supabase');
const fs = require('fs');
const path = require('path');

function detectContentType(localPath, bucket) {
  const ext = path.extname(localPath).toLowerCase();
  if (bucket === 'voice-notes') {
    const map = {
      '.webm': 'audio/webm',
      '.ogg': 'audio/ogg',
      '.mp4': 'audio/mp4',
      '.m4a': 'audio/mp4',
      '.wav': 'audio/wav',
      '.mp3': 'audio/mpeg',
      '.flac': 'audio/flac',
    };
    return map[ext] || 'audio/ogg';
  }
  const map = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.pdf': 'application/pdf',
    '.dcm': 'application/dicom',
  };
  return map[ext] || 'image/jpeg';
}

async function uploadFile(localPath, bucket, storagePath) {
  // Use stat for size — avoids loading the entire file into memory
  const sizeKb = Math.ceil(fs.statSync(localPath).size / 1024);
  const ext = path.extname(localPath) || (bucket === 'voice-notes' ? '.ogg' : '.jpg');
  const finalPath = storagePath + ext;
  const contentType = detectContentType(localPath, bucket);

  // Stream the file rather than buffering it — prevents OOM on 25 MB audio uploads
  const stream = fs.createReadStream(localPath);

  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(finalPath, stream, { contentType, upsert: false });

  if (error) throw new Error(`Upload failed (${bucket}): ${error.message}`);
  return { storagePath: data.path, sizeKb };
}

async function getSignedUrl(bucket, storagePath, expiresIn = 3600) {
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(storagePath, expiresIn);
  if (error) throw new Error(`Signed URL failed: ${error.message}`);
  return data.signedUrl;
}

async function deleteFile(bucket, storagePath) {
  const { error } = await supabase.storage.from(bucket).remove([storagePath]);
  if (error) console.error(`[Storage] Delete failed ${bucket}/${storagePath}:`, error.message);
}

module.exports = { uploadFile, getSignedUrl, deleteFile };
