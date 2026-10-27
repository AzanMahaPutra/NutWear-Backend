/**
 * Audit Update 12 — pencarian pada stockRepository.findInventory (endpoint lama GET /stock/inventory).
 * Kata kunci admin harus diperlakukan sebagai teks biasa: tidak boleh menyisipkan sintaks filter
 * PostgREST (koma/kurung) dan wildcard LIKE (% _) harus di-escape.
 */
process.env.NODE_ENV = "test";
process.env.SUPABASE_URL = "http://fake.supabase.local";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test";
process.env.SUPABASE_ANON_KEY = "anon-test";

const test = require("node:test");
const assert = require("node:assert/strict");

const PRODUCT_ID = "aaaaaaaa-0000-4000-8000-000000000001";
const urls = [];
const realFetch = global.fetch;
global.fetch = async (input) => {
  const url = new URL(typeof input === "string" ? input : input.url);
  urls.push(url);
  const body = url.pathname.endsWith("/products") ? [{ id: PRODUCT_ID }] : [];
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json", "Content-Range": "*/0" },
  });
};
test.after(() => {
  global.fetch = realFetch;
});

const stockRepository = require("../src/repositories/stockRepository");

test("search berisi koma/kurung tidak menjadi sintaks filter .or()", async () => {
  urls.length = 0;
  await stockRepository.findInventory({ search: "x),stok.gt.0,(sku.eq.a", status: undefined, minimumStock: 5 });
  const variantReq = urls.find((u) => u.pathname.endsWith("/product_variants"));
  const or = variantReq.searchParams.get("or");
  assert.ok(or, "klausa or harus ada karena produk cocok");
  // Seluruh kata kunci ada di dalam satu nilai ber-kutip; tidak ada kondisi tambahan.
  assert.match(or, /^\(sku\.ilike\."%x\),stok\.gt\.0,\(sku\.eq\.a%",product_id\.in\.\([0-9a-f-]+\)\)$/);
});

test("wildcard % dan _ di-escape (dicari sebagai teks biasa)", async () => {
  urls.length = 0;
  await stockRepository.findInventory({ search: "50%_off", minimumStock: 5 });
  const productsReq = urls.find((u) => u.pathname.endsWith("/products"));
  assert.equal(productsReq.searchParams.get("nama_produk"), "ilike.%50\\%\\_off%");
});
