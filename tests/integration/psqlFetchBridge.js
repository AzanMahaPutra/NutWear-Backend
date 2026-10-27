/**
 * Pengganti `fetch` untuk tes integrasi: panggilan RPC rate_limit_hit / rate_limit_status
 * diteruskan ke PostgreSQL SUNGGUHAN lewat `psql` (SQL migrasi yang asli dieksekusi).
 * Auth (GoTrue) & tabel users tetap fake karena bukan objek yang diuji.
 * Tiap proses yang memuat modul ini = satu "instance backend" dengan memori sendiri.
 */
const { execFileSync } = require("node:child_process");
const { createFakeLoginBackend } = require("../fakeLoginBackend");

const DB = process.env.TEST_DATABASE_URL;
const accounts = [{ id: "30000000-0000-4000-8000-000000000001", email: "budi@nutwear.id", password: "Benar123", nama: "Budi" }];
const { fakeFetch } = createFakeLoginBackend({ accounts });

function psqlJson(sql, vars) {
  const args = [DB, "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1"];
  for (const [k, v] of Object.entries(vars)) args.push("-v", `${k}=${v}`);
  const out = execFileSync("psql", args, { input: sql, encoding: "utf8" }).trim();
  return JSON.parse(out);
}

globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === "string" ? input : input.url);
  const rpc = /^\/rest\/v1\/rpc\/(rate_limit_hit|rate_limit_status)$/.exec(url.pathname);
  if (!rpc) return fakeFetch(input, init);
  const a = JSON.parse(init.body);
  let rows;
  if (rpc[1] === "rate_limit_hit") {
    rows = psqlJson("select coalesce(json_agg(t), '[]') from rate_limit_hit(:'k', :w, :m, :c) t", { k: a.p_key, w: a.p_window_ms, m: a.p_max, c: a.p_cooldown_ms });
  } else {
    rows = psqlJson("select coalesce(json_agg(t), '[]') from rate_limit_status(:'k') t", { k: a.p_key });
  }
  return new Response(JSON.stringify(rows), { status: 200, headers: { "content-type": "application/json" } });
};
