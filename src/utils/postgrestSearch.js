/**
 * Helper pencarian teks bersama untuk query Supabase/PostgREST (dipakai Manajemen User
 * dan Permohonan Unban). Input admin selalu diperlakukan sebagai TEKS BIASA.
 */
const SEARCH_MAX_LENGTH = 100;

/** Rapikan kata kunci: buang karakter kontrol (termasuk NUL yang ditolak Postgres), rapikan spasi, potong. */
function normalizeSearchTerm(raw) {
  return String(raw ?? "")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, SEARCH_MAX_LENGTH);
}

/** Escape wildcard LIKE (`\`, `%`, `_`) supaya input admin dicocokkan sebagai teks biasa. */
function escapeLike(term) {
  return term.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * Bungkus nilai sebagai string ber-kutip PostgREST untuk dipakai di dalam `.or(...)`.
 * Di dalam kutip, koma/kurung/titik-dua dari input admin hanya menjadi teks, bukan sintaks filter;
 * hanya `\` dan `"` yang perlu di-escape dengan backslash.
 */
function quotePostgrestValue(value) {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** Kata kunci mentah -> pola ILIKE ber-kutip siap pakai di `.or(...)`, atau null bila kosong. */
function buildIlikePattern(rawTerm) {
  const term = normalizeSearchTerm(rawTerm);
  if (!term) return null;
  return quotePostgrestValue(`%${escapeLike(term)}%`);
}

module.exports = { SEARCH_MAX_LENGTH, normalizeSearchTerm, escapeLike, quotePostgrestValue, buildIlikePattern };
