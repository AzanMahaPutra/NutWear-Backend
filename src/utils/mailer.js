const nodemailer = require("nodemailer");
const env = require("../config/env");
const logger = require("./logger");

/**
 * Transporter email reusable (SMTP) — dipakai untuk mengirim email Reset
 * Password. Satu-satunya tempat konfigurasi SMTP di backend.
 *
 * Env yang dibutuhkan (lihat .env / CHANGELOG.md untuk contoh lengkap):
 *   SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, SMTP_FROM
 *
 * Transporter sengaja dibuat lazy (getTransporter) supaya:
 * - Jika Environment Variable SMTP belum diisi, server tetap bisa start
 *   (tidak crash saat boot), tapi setiap percobaan kirim email akan gagal
 *   dengan log error yang jelas ("SMTP_* belum dikonfigurasi") alih-alih
 *   error samar dari nodemailer.
 * - transporter dan koneksi pool-nya dibuat sekali saja (bukan setiap kali
 *   ada request forgot-password), lebih efisien.
 */
let transporter = null;
let transporterError = null;

function getTransporter() {
  if (transporter || transporterError) {
    return transporter;
  }

  const { host, port, user, pass } = env.smtp;

  if (!host || !port || !user || !pass) {
    transporterError = "SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS belum diset di Environment Variable (.env)";
    logger.error("[mailer] Konfigurasi SMTP tidak lengkap, email tidak dapat dikirim", {
      hostSet: Boolean(host),
      portSet: Boolean(port),
      userSet: Boolean(user),
      passSet: Boolean(pass),
    });
    return null;
  }

  transporter = nodemailer.createTransport({
    host,
    port,
    secure: env.smtp.secure, // true untuk port 465 (SSL), false untuk 587/25 (STARTTLS)
    auth: { user, pass },
  });

  // Verifikasi koneksi & kredensial SMTP di background saat transporter pertama
  // kali dibuat, supaya kesalahan konfigurasi (host salah, port diblokir,
  // username/password salah) langsung terlihat di log backend tanpa harus
  // menunggu user pertama mencoba Forgot Password.
  transporter.verify().then(
    () => logger.info("[mailer] Koneksi SMTP berhasil diverifikasi, siap mengirim email"),
    (err) =>
      logger.error("[mailer] Verifikasi koneksi SMTP gagal — cek SMTP_HOST/SMTP_PORT/SMTP_SECURE/kredensial", {
        error: err.message,
      })
  );

  return transporter;
}

/**
 * Kirim email Reset Password. Melempar Error kalau gagal (dipanggil oleh
 * authService yang akan menangkap & mencatat log-nya — respons ke user tetap
 * pesan generik demi mencegah enumerasi akun, lihat authService.js).
 */
async function sendPasswordResetEmail({ to, resetUrl, expiresMinutes }) {
  const activeTransporter = getTransporter();

  if (!activeTransporter) {
    throw new Error(transporterError || "Transporter SMTP tidak tersedia");
  }

  const subject = "Reset Password — NutWear";
  const text =
    `Kami menerima permintaan untuk mereset password akun NutWear Anda.\n\n` +
    `Klik link berikut untuk membuat password baru (berlaku ${expiresMinutes} menit):\n${resetUrl}\n\n` +
    `Jika Anda tidak meminta reset password, abaikan email ini — password Anda tidak akan berubah.`;
  const html = `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <h2 style="color: #171717;">Reset Password NutWear</h2>
      <p>Kami menerima permintaan untuk mereset password akun NutWear Anda.</p>
      <p>Klik tombol di bawah ini untuk membuat password baru. Link ini hanya berlaku selama
        <strong>${expiresMinutes} menit</strong> dan hanya dapat digunakan satu kali.</p>
      <p style="margin: 24px 0;">
        <a href="${resetUrl}"
           style="background:#171717;color:#ffffff;padding:12px 24px;border-radius:9999px;text-decoration:none;font-weight:600;">
          Reset Password
        </a>
      </p>
      <p style="font-size: 12px; color: #737373;">
        Jika tombol di atas tidak berfungsi, salin dan tempel link berikut ke browser Anda:<br/>
        <a href="${resetUrl}">${resetUrl}</a>
      </p>
      <p style="font-size: 12px; color: #737373;">
        Jika Anda tidak meminta reset password, abaikan email ini — password Anda tidak akan berubah.
      </p>
    </div>
  `;

  try {
    const info = await activeTransporter.sendMail({
      from: env.smtp.from || env.smtp.user,
      to,
      subject,
      text,
      html,
    });
    logger.info("[mailer] Email reset password berhasil dikirim", { to, messageId: info.messageId });
    return info;
  } catch (err) {
    // Log sedetail mungkin supaya penyebab kegagalan (auth SMTP salah, ditolak
    // provider, koneksi timeout, dll) bisa langsung diketahui dari log backend.
    logger.error("[mailer] Gagal mengirim email reset password", {
      to,
      error: err.message,
      code: err.code,
      command: err.command,
      responseCode: err.responseCode,
    });
    throw err;
  }
}

module.exports = { sendPasswordResetEmail };
