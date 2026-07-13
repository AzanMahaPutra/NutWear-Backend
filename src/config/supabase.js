const { createClient } = require("@supabase/supabase-js");

/**
 * Satu-satunya tempat inisialisasi Supabase client.
 * Menggunakan Service Role Key karena backend perlu akses penuh
 * (bypass Row Level Security) untuk operasi CRUD melalui REST API sendiri.
 * Jangan pernah expose key ini ke frontend.
 */
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.warn(
    "[config/supabase] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY belum diset. " +
      "Isi file .env sebelum menjalankan server."
  );
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: { persistSession: false },
  }
);

module.exports = { supabase };
