const supabase = require('../config/supabase');
const fs = require('fs');
const path = require('path');

async function uploadFile(localPath, bucket, storagePath) {
  const buffer = fs.readFileSync(localPath);
  const sizeKb = Math.ceil(buffer.length / 1024);
  const ext = path.extname(localPath);
  const ext2 = ext || (bucket === 'voice-notes' ? '.m4a' : '.jpg');
  const finalPath = storagePath + ext2;

  const contentType = bucket === 'voice-notes'
    ? 'audio/mp4'
    : localPath.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg';

  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(finalPath, buffer, { contentType, upsert: false });

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
