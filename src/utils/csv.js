/**
 * UPDATE 07 — Utilitas CSV (dipakai Ekspor CSV Laporan Transaksi).
 *
 * Aturan:
 * 1. Semua field TEKS selalu dibungkus tanda kutip ganda, dan `"` di dalam teks digandakan
 *    (RFC 4180). Angka ditulis polos tanpa kutip supaya Excel membacanya sebagai angka.
 * 2. Pemisah baris CRLF; baris baru DI DALAM sebuah field diganti spasi agar satu transaksi
 *    selalu tepat satu baris.
 * 3. Pencegahan CSV/formula injection (OWASP): teks yang (setelah spasi di depan) diawali
 *    `=`, `+`, `-`, `@`, atau diawali karakter TAB diberi awalan `'` sehingga Excel/
 *    LibreOffice/Sheets menganggapnya teks biasa, bukan rumus.
 * 4. Awal file: BOM UTF-8 (Excel membaca huruf non-ASCII dengan benar) + petunjuk
 *    `sep=,` supaya Excel dengan pengaturan regional Indonesia (pemisah daftar `;`) tetap
 *    memecah kolom berdasarkan koma.
 */

const BOM = "\uFEFF";
const SEP_HINT = "sep=,";
const EOL = "\r\n";

function neutralizeFormula(text) {
  const trimmedStart = text.replace(/^[\s ]+/, "");
  if (/^[=+\-@]/.test(trimmedStart) || /^\t/.test(text)) {
    return `'${text}`;
  }
  return text;
}

/** Satu field CSV: angka -> polos, selain itu -> teks ter-escape & aman dari formula injection. */
function csvField(value) {
  if (value === null || value === undefined) return '""';
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : '""';
  }
  const text = neutralizeFormula(
    String(value)
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "") // karakter kontrol (selain TAB, LF, CR)
      .replace(/\r\n|\r|\n/g, " ")
  );
  return `"${text.replace(/"/g, '""')}"`;
}

function csvLine(fields) {
  return fields.map(csvField).join(",") + EOL;
}

/** Bagian awal file: BOM + petunjuk pemisah + baris header. */
function csvPreamble(headers) {
  return BOM + SEP_HINT + EOL + csvLine(headers);
}

module.exports = { csvField, csvLine, csvPreamble, BOM, SEP_HINT, EOL };
