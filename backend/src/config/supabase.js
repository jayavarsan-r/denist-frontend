const { createClient } = require('@supabase/supabase-js');

// The sb_secret_* key works with supabase-js for data operations.
// Fall back to anon key if service key format is not JWT.
const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

module.exports = createClient(process.env.SUPABASE_URL, key, {
  auth: { persistSession: false },
});
