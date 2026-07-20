const { createClient } = require("@supabase/supabase-js");

/**
 * Inisialisasi Supabase client.
 *
 * ADA DUA CLIENT dengan tujuan berbeda (lihat dokumentasi resmi Supabase Auth
 * soal pemisahan service role vs anon key):
 *
 * 1. `supabase` (Service Role Key) — dipakai untuk:
 *    - Query CRUD ke tabel `users` (profil), bypass Row Level Security.
 *    - Operasi Admin Auth API (`supabase.auth.admin.*`), mis. createUser saat
 *      Register, dan verifikasi access token milik user lain di authMiddleware.
 *    Key ini SANGAT rahasia — jangan pernah dikirim ke frontend.
 *
 * 2. `supabaseAuth` (Anon Key) — dipakai KHUSUS untuk operasi Auth yang
 *    bertindak "atas nama user itu sendiri", mengikuti alur resmi Supabase Auth:
 *    - signInWithPassword (Login)
 *    - refreshSession (Refresh Token)
 *    - resetPasswordForEmail (Forgot Password — mengirim email lewat mekanisme
 *      bawaan Supabase, BUKAN sistem reset password custom)
 *    Anon key aman dipakai di server (nilainya publik, sama seperti yang
 *    dipakai frontend), tapi dipisah dari service role supaya operasi Login
 *    tetap tunduk pada rules GoTrue standar (bukan admin bypass).
 */
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.warn(
    "[config/supabase] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY belum diset. " +
      "Isi file .env sebelum menjalankan server."
  );
}

if (!process.env.SUPABASE_ANON_KEY) {
  console.warn(
    "[config/supabase] SUPABASE_ANON_KEY belum diset. Login, Refresh Token, dan " +
      "Forgot Password (Supabase Auth) tidak akan berfungsi tanpa ini. " +
      "Ambil dari Supabase Dashboard → Project Settings → API → Project API keys → anon public."
  );
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const supabaseAuth = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

module.exports = { supabase, supabaseAuth };
