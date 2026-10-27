const { supabase } = require("../config/supabase");
const { AppError } = require("../utils/AppError");
const logger = require("../utils/logger");

/**
 * Pesan yang aman ditampilkan ke user ketika penyimpanan rate limit tidak bisa dipakai.
 * Sengaja generik: tidak menyebut tabel, fungsi, atau detail infrastruktur.
 */
const RATE_LIMIT_UNAVAILABLE_MESSAGE =
  "Layanan login sedang tidak tersedia sementara. Silakan coba lagi beberapa saat lagi.";

/**
 * Store express-rate-limit yang counter-nya disimpan di Postgres (Supabase) lewat
 * fungsi atomik `rate_limit_hit` dan dibaca (tanpa menambah hit) lewat
 * `rate_limit_status` — lihat migrations/20260728_create_rate_limits.sql dan
 * migrations/20261023_login_rate_limit_status.sql.
 *
 * Kenapa bukan MemoryStore: backend berjalan di Vercel serverless — tiap instance
 * punya memori sendiri & sering di-recycle, sehingga counter in-memory bisa
 * di-reset / tidak konsisten antar instance. Semua instance membaca baris yang sama
 * di database, dan waktu berakhir blokir (`blocked_until`, timestamptz) selalu
 * dihitung dengan jam DATABASE.
 *
 * Sisa waktu (`retry_after_ms`) dihitung DI DATABASE, lalu dijadikan `resetTime`
 * relatif terhadap jam instance ini. Dengan begitu selisih jam antara instance dan
 * database tidak memengaruhi countdown.
 *
 * FAIL-CLOSED: bila database tidak bisa dihubungi (migrasi belum dijalankan,
 * Supabase down, dst), store MELEMPAR AppError 503 — request login ditolak. Store
 * TIDAK lagi jatuh ke counter in-memory per-instance, karena itu akan diam-diam
 * melemahkan proteksi brute force (counter terpecah antar instance & hilang saat
 * cold start) sementara login tetap diizinkan.
 *
 * Mode `memoryOnly` (RATE_LIMIT_STORE=memory, default di development/test) memakai
 * Map per-proses dengan aturan IDENTIK. Itu hanya untuk lokal/test: tidak dibagikan
 * antar proses/instance dan hilang saat proses restart.
 */
class SupabaseRateLimitStore {
  /**
   * @param {{ prefix: string, windowMs: number, max: number, cooldownMs: number, memoryOnly?: boolean }} opts
   */
  constructor({ prefix, windowMs, max, cooldownMs, memoryOnly = false }) {
    this.memoryOnly = memoryOnly;
    this.prefix = prefix;
    this.windowMs = windowMs;
    this.max = max;
    this.cooldownMs = cooldownMs;
    this.memory = new Map(); // key -> { hits, windowStart, blockedUntil }  (hanya mode memoryOnly)
  }

  // express-rate-limit memanggil ini sekali; kita sudah punya semua konfigurasi.
  init() {}

  _key(key) {
    return `${this.prefix}:${key}`;
  }

  _unavailable(operation, err) {
    // Detail teknis hanya ke log server (tanpa key/email/IP); user hanya menerima pesan generik.
    logger.error("[rateLimitStore] Penyimpanan rate limit gagal — request ditolak (fail-closed)", {
      prefix: this.prefix,
      operation,
      error: err?.message,
    });
    return new AppError(RATE_LIMIT_UNAVAILABLE_MESSAGE, 503);
  }

  /** Dipanggil express-rate-limit untuk SETIAP request login: menambah 1 hit. */
  async increment(key) {
    if (this.memoryOnly) return this._incrementMemory(key, Date.now());
    try {
      const { data, error } = await supabase.rpc("rate_limit_hit", {
        p_key: this._key(key),
        p_window_ms: this.windowMs,
        p_max: this.max,
        p_cooldown_ms: this.cooldownMs,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      const totalHits = Number(row?.total_hits);
      if (!row || !Number.isFinite(totalHits)) throw new Error("rate_limit_hit mengembalikan data tidak valid");
      return { totalHits, resetTime: new Date(Date.now() + this._retryAfterMs(row)) };
    } catch (err) {
      throw this._unavailable("increment", err);
    }
  }

  /**
   * Status blokir untuk satu key TANPA menambah hit dan tanpa memperpanjang blokir.
   * @returns {Promise<{ blocked: boolean, retryAfterMs: number }>}
   */
  async status(key) {
    if (this.memoryOnly) return this._statusMemory(key, Date.now());
    try {
      const { data, error } = await supabase.rpc("rate_limit_status", { p_key: this._key(key) });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row || typeof row.blocked !== "boolean") throw new Error("rate_limit_status mengembalikan data tidak valid");
      const retryAfterMs = row.blocked ? Math.max(1, Number(row.retry_after_ms) || 0) : 0;
      return { blocked: row.blocked && retryAfterMs > 0, retryAfterMs };
    } catch (err) {
      throw this._unavailable("status", err);
    }
  }

  /** Sisa waktu dari DB; bila fungsi DB versi lama (belum ada retry_after_ms) pakai reset_at. */
  _retryAfterMs(row) {
    const fromDb = Number(row.retry_after_ms);
    if (row.retry_after_ms !== undefined && row.retry_after_ms !== null && Number.isFinite(fromDb)) {
      return Math.max(0, fromDb);
    }
    const resetAt = new Date(row.reset_at).getTime();
    if (!Number.isFinite(resetAt)) throw new Error("rate_limit_hit tidak mengembalikan waktu reset yang valid");
    return Math.max(0, resetAt - Date.now());
  }

  _incrementMemory(key, now) {
    let e = this.memory.get(key);
    if (e?.blockedUntil > now) {
      return { totalHits: this.max + 1, resetTime: new Date(e.blockedUntil) };
    }
    if (!e || e.blockedUntil || e.windowStart + this.windowMs <= now) {
      e = { hits: 0, windowStart: now, blockedUntil: 0 };
    }
    e.hits += 1;
    if (e.hits > this.max) e.blockedUntil = now + this.cooldownMs;
    this.memory.set(key, e);

    if (this.memory.size > 5000) {
      for (const [k, v] of this.memory) {
        if ((v.blockedUntil || v.windowStart + this.windowMs) < now) this.memory.delete(k);
      }
    }
    return { totalHits: e.hits, resetTime: new Date(e.blockedUntil || e.windowStart + this.windowMs) };
  }

  _statusMemory(key, now) {
    const e = this.memory.get(key);
    if (e?.blockedUntil > now) return { blocked: true, retryAfterMs: e.blockedUntil - now };
    return { blocked: false, retryAfterMs: 0 };
  }

  // Dipanggil express-rate-limit hanya untuk skipFailedRequests/skipSuccessfulRequests
  // (tidak kita pakai: SEMUA percobaan login dihitung, termasuk yang sukses).
  async decrement() {}

  /**
   * Menghapus counter satu key. TIDAK dipasang ke route mana pun — tidak ada endpoint
   * reset blokir (publik maupun admin). Hanya API internal bawaan express-rate-limit.
   */
  async resetKey(key) {
    this.memory.delete(key);
    if (this.memoryOnly) return;
    try {
      await supabase.from("rate_limits").delete().eq("key", this._key(key));
    } catch (_) {
      /* best-effort */
    }
  }
}

module.exports = { SupabaseRateLimitStore, RATE_LIMIT_UNAVAILABLE_MESSAGE };
