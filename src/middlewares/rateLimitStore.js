const { supabase } = require("../config/supabase");
const logger = require("../utils/logger");

/**
 * Store express-rate-limit yang counter-nya disimpan di Postgres (Supabase) lewat
 * fungsi atomik `rate_limit_hit` (lihat migrations/20260728_create_rate_limits.sql).
 *
 * Kenapa bukan MemoryStore: backend berjalan di Vercel serverless — tiap instance
 * punya memori sendiri & sering di-recycle, sehingga counter in-memory bisa
 * di-reset / tidak konsisten antar instance. Tanpa dependency baru (Supabase
 * sudah dipakai project ini).
 *
 * Window & cooldown dihitung di SQL, jadi store ini mengembalikan `resetTime`
 * = akhir window ATAU akhir cooldown (dipakai express-rate-limit untuk Retry-After).
 *
 * Jika database tidak bisa dihubungi (mis. migrasi belum dijalankan / Supabase
 * down), store jatuh ke counter in-memory dengan aturan yang sama — proteksi
 * tetap ada (per-instance) dan login TIDAK ikut mati.
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
    this.fallback = new Map(); // key -> { hits, windowStart, blockedUntil }
    this.lastFallbackLogAt = 0;
  }

  // express-rate-limit memanggil ini sekali; kita sudah punya semua konfigurasi.
  init() {}

  _key(key) {
    return `${this.prefix}:${key}`;
  }

  async increment(key) {
    // Mode memory (development lokal / RATE_LIMIT_STORE=memory): aturan identik, tanpa DB.
    if (this.memoryOnly) return this._incrementFallback(key, Date.now());
    try {
      const { data, error } = await supabase.rpc("rate_limit_hit", {
        p_key: this._key(key),
        p_window_ms: this.windowMs,
        p_max: this.max,
        p_cooldown_ms: this.cooldownMs,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) throw new Error("rate_limit_hit tidak mengembalikan data");
      return { totalHits: Number(row.total_hits), resetTime: new Date(row.reset_at) };
    } catch (err) {
      const now = Date.now();
      if (now - this.lastFallbackLogAt > 60_000) {
        this.lastFallbackLogAt = now;
        logger.error("[rateLimitStore] Database rate limit gagal, memakai fallback in-memory", {
          prefix: this.prefix,
          error: err.message,
        });
      }
      return this._incrementFallback(key, now);
    }
  }

  _incrementFallback(key, now) {
    let e = this.fallback.get(key);
    if (e?.blockedUntil > now) {
      return { totalHits: this.max + 1, resetTime: new Date(e.blockedUntil) };
    }
    if (!e || e.blockedUntil || e.windowStart + this.windowMs <= now) {
      e = { hits: 0, windowStart: now, blockedUntil: 0 };
    }
    e.hits += 1;
    if (e.hits > this.max) e.blockedUntil = now + this.cooldownMs;
    this.fallback.set(key, e);

    if (this.fallback.size > 5000) {
      for (const [k, v] of this.fallback) {
        if ((v.blockedUntil || v.windowStart + this.windowMs) < now) this.fallback.delete(k);
      }
    }
    return { totalHits: e.hits, resetTime: new Date(e.blockedUntil || e.windowStart + this.windowMs) };
  }

  // Dipanggil express-rate-limit hanya untuk skipFailedRequests/skipSuccessfulRequests
  // (tidak kita pakai: SEMUA percobaan login dihitung, termasuk yang sukses).
  async decrement() {}

  async resetKey(key) {
    this.fallback.delete(key);
    if (this.memoryOnly) return;
    try {
      await supabase.from("rate_limits").delete().eq("key", this._key(key));
    } catch (_) {
      /* best-effort */
    }
  }
}

module.exports = { SupabaseRateLimitStore };
