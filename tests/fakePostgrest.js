/**
 * Pengganti `fetch` yang meniru subset PostgREST/GoTrue Supabase, hanya untuk tes lokal.
 * Tujuannya menguji repository -> service -> controller -> route yang SESUNGGUHNYA lewat
 * @supabase/supabase-js asli (bukan mock di level repository), jadi string filter `.or(...)`,
 * quoting, count, order, dan range benar-benar diparse seperti PostgREST.
 *
 * Yang ditiru: filter `eq`, `or=(kolom.ilike."pola",...)` dengan nilai ber-kutip + escape `\\`/`\"`,
 * ILIKE ala Postgres (case-insensitive, `%` `_` wildcard, `\` escape), order multi-kolom,
 * limit/offset, dan `Prefer: count=exact` -> header Content-Range.
 * BUKAN database sungguhan: perilaku collation/locale Postgres tidak ikut ditiru.
 */

/** Parse isi `or=(...)` ala PostgREST: daftar "kolom.operator.nilai" dipisah koma, nilai boleh ber-kutip. */
function parseOrClause(raw) {
  if (!raw.startsWith("(") || !raw.endsWith(")")) throw new Error(`or tidak valid: ${raw}`);
  const s = raw.slice(1, -1);
  const conditions = [];
  let i = 0;
  while (i < s.length) {
    const colEnd = s.indexOf(".", i);
    const opEnd = s.indexOf(".", colEnd + 1);
    const column = s.slice(i, colEnd);
    const op = s.slice(colEnd + 1, opEnd);
    i = opEnd + 1;
    let value = "";
    if (s[i] === '"') {
      i++;
      while (i < s.length && s[i] !== '"') {
        if (s[i] === "\\") i++; // backslash meng-escape karakter berikutnya
        value += s[i++];
      }
      if (s[i] !== '"') throw new Error("kutip tidak tertutup");
      i++; // kutip penutup
    } else {
      while (i < s.length && s[i] !== ",") value += s[i++];
    }
    conditions.push({ column, op, value });
    if (i < s.length) {
      if (s[i] !== ",") throw new Error(`sintaks or tidak valid di posisi ${i}: "${s.slice(i)}"`);
      i++;
    }
  }
  return conditions;
}

/** ILIKE Postgres: `%` = apa saja, `_` = satu karakter, `\x` = karakter x apa adanya. */
function ilike(text, pattern) {
  let re = "";
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === "\\") re += pattern[++i].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    else if (c === "%") re += ".*";
    else if (c === "_") re += ".";
    else re += c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`, "is").test(String(text ?? ""));
}

function createFakeBackend({ tokens, users, orderCounts = {}, reviewCounts = {}, unbanRequests = [] }) {
  const state = { failUsersList: false, failUnbanList: false, failUnbanDelete: false, calls: [], deleted: [] };

  const json = (status, body, headers = {}) =>
    new Response(body === null ? null : JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json", ...headers },
    });

  async function fakeFetch(input, init = {}) {
    const url = new URL(typeof input === "string" ? input : input.url);
    const method = (init.method || "GET").toUpperCase();
    const headers = new Headers(init.headers || {});
    state.calls.push({ method, url: url.pathname + url.search });

    if (url.pathname === "/auth/v1/user") {
      const token = (headers.get("authorization") || "").replace(/^Bearer /, "");
      const user = tokens[token];
      if (!user) return json(401, { msg: "invalid JWT", code: 401 });
      return json(200, { id: user.id, email: user.email, user_metadata: {} });
    }

    const table = url.pathname.replace("/rest/v1/", "");
    const p = url.searchParams;

    if (table === "orders" || table === "reviews") {
      const userId = (p.get("user_id") || "").replace("eq.", "");
      const n = (table === "orders" ? orderCounts : reviewCounts)[userId] ?? 0;
      return json(200, null, { "content-range": `*/${n}` });
    }

    if (table === "unban_requests") {
      // Filter kolom biasa: id=eq.x, status=eq.x, status=in.(a,b)
      const applyFilters = (rows) => {
        let out = rows;
        for (const [key, val] of p.entries()) {
          if (key === "id" && val.startsWith("eq.")) out = out.filter((r) => r.id === val.slice(3));
          else if (key === "status" && val.startsWith("eq.")) out = out.filter((r) => r.status === val.slice(3));
          else if (key === "status" && val.startsWith("in.(")) {
            const set = val.slice(4, -1).split(",");
            out = out.filter((r) => set.includes(r.status));
          }
        }
        return out;
      };

      if (method === "DELETE") {
        if (state.failUnbanDelete) return json(500, { message: "simulasi gagal hapus", code: "XX000" });
        const victims = applyFilters(unbanRequests);
        for (const v of victims) {
          unbanRequests.splice(unbanRequests.indexOf(v), 1);
          state.deleted.push(v.id);
        }
        const wantsRep = /return=representation/.test(headers.get("prefer") || "");
        return json(200, wantsRep ? victims.map((v) => ({ id: v.id })) : null);
      }

      if (method === "GET") {
        if (state.failUnbanList) return json(500, { message: "simulasi database error", code: "XX000" });
        let rows = applyFilters(unbanRequests);

        // Embed `users!fk[!inner](kolom,...)`: tanpa !inner baris induk tidak pernah tersaring (seperti PostgREST).
        const select = p.get("select") || "*";
        const embed = /users!([a-z_]+)(!inner)?\s*\(([^)]*)\)/.exec(select);
        const embedCols = embed ? embed[3].split(",").map((c) => c.trim()) : [];
        const inner = Boolean(embed && embed[2]);
        const userOf = (r) => users.find((u) => u.id === r.user_id);
        if (p.has("users.or")) {
          if (!embed) throw new Error("users.or tanpa embed users");
          const conds = parseOrClause(p.get("users.or"));
          const matches = (r) => {
            const u = userOf(r);
            return Boolean(u) && conds.some((c) => ilike(u[c.column], c.value));
          };
          if (inner) rows = rows.filter(matches);
        } else if (inner) {
          rows = rows.filter((r) => userOf(r));
        }

        rows = [...rows].sort((a, b) => {
          for (const [col, dir] of (p.get("order") || "").split(",").filter(Boolean).map((o) => o.split("."))) {
            if (a[col] === b[col]) continue;
            return (a[col] < b[col] ? -1 : 1) * (dir === "desc" ? -1 : 1);
          }
          return 0;
        });

        const total = rows.length;
        const offset = Number(p.get("offset") || 0);
        const limit = p.has("limit") ? Number(p.get("limit")) : total;
        const out = rows.slice(offset, offset + limit).map((r) => {
          if (!embed) return { ...r };
          const u = userOf(r);
          return { ...r, users: u ? Object.fromEntries(embedCols.map((c) => [c, u[c]])) : null };
        });
        const wantsCount = /count=exact/.test(headers.get("prefer") || "");
        const range = out.length ? `${offset}-${offset + out.length - 1}/${wantsCount ? total : "*"}` : `*/${wantsCount ? total : "*"}`;
        return json(200, out, { "content-range": range });
      }
    }

    if (table === "users" && method === "GET") {
      const isList = p.has("role") || p.has("or");
      if (isList && state.failUsersList) {
        return json(500, { message: "simulasi database error", code: "XX000" });
      }

      let rows = [...users];
      for (const [key, val] of p.entries()) {
        if (key === "id" && val.startsWith("eq.")) rows = rows.filter((r) => r.id === val.slice(3));
        else if (key === "role" && val.startsWith("eq.")) rows = rows.filter((r) => r.role === val.slice(3));
        else if (key === "or") {
          const conds = parseOrClause(val);
          rows = rows.filter((r) =>
            conds.some((c) => {
              if (c.op !== "ilike") throw new Error(`operator tidak didukung: ${c.op}`);
              return ilike(r[c.column], c.value);
            })
          );
        }
      }

      const order = (p.get("order") || "").split(",").filter(Boolean).map((o) => o.split("."));
      rows.sort((a, b) => {
        for (const [col, dir] of order) {
          if (a[col] === b[col]) continue;
          return (a[col] < b[col] ? -1 : 1) * (dir === "desc" ? -1 : 1);
        }
        return 0;
      });

      const total = rows.length;
      const offset = Number(p.get("offset") || 0);
      const limit = p.has("limit") ? Number(p.get("limit")) : total;
      const page = rows.slice(offset, offset + limit);

      const select = (p.get("select") || "*").split(",").map((s) => s.trim());
      const shaped = select[0] === "*" ? page : page.map((r) => Object.fromEntries(select.map((c) => [c, r[c]])));

      const wantsCount = /count=exact/.test(headers.get("prefer") || "");
      const range = shaped.length ? `${offset}-${offset + shaped.length - 1}/${wantsCount ? total : "*"}` : `*/${wantsCount ? total : "*"}`;
      return json(200, shaped, { "content-range": range });
    }

    return json(404, { message: `fake: ${method} ${url.pathname} tidak ditiru` });
  }

  return { fakeFetch, state };
}

module.exports = { createFakeBackend, parseOrClause, ilike };
