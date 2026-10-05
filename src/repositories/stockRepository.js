const { supabase } = require("../config/supabase");
const { AppError } = require("../utils/AppError");

/**
 * `meta` (opsional, dipakai fitur Riwayat Perubahan Stok — Halaman Inventory
 * Stock Admin): { adminId } — admin yang melakukan perubahan. Dibiarkan
 * opsional supaya pengurangan stok otomatis saat checkout (lihat
 * orderService.js, dipanggil tanpa admin) tetap berjalan seperti sebelumnya.
 */
async function decreaseStock(variantId, quantity, meta = {}) {
  const { data: variant, error: fetchError } = await supabase
    .from("product_variants")
    .select("stok")
    .eq("id", variantId)
    .maybeSingle();
  if (fetchError) throw new AppError(fetchError.message, 500);
  if (!variant || variant.stok < quantity) {
    throw new AppError("Stok tidak mencukupi untuk salah satu produk", 400);
  }

  const stokSesudah = variant.stok - quantity;
  const { error } = await supabase.from("product_variants").update({ stok: stokSesudah }).eq("id", variantId);
  if (error) throw new AppError(error.message, 500);

  return logStock(variantId, -quantity, "out", { ...meta, stokSebelum: variant.stok, stokSesudah });
}

async function increaseStock(variantId, quantity, meta = {}) {
  const { data: variant, error: fetchError } = await supabase
    .from("product_variants")
    .select("stok")
    .eq("id", variantId)
    .maybeSingle();
  if (fetchError) throw new AppError(fetchError.message, 500);

  const stokSebelum = variant?.stok || 0;
  const stokSesudah = stokSebelum + quantity;
  const { error } = await supabase.from("product_variants").update({ stok: stokSesudah }).eq("id", variantId);
  if (error) throw new AppError(error.message, 500);

  return logStock(variantId, quantity, "in", { ...meta, stokSebelum, stokSesudah });
}

/**
 * UPDATE — Halaman Inventory Stock Admin: Admin menetapkan langsung nilai
 * "Stok Baru" (baik lewat input manual maupun tombol Quick Adjustment
 * +5/+10/-5/-10 yang dihitung di frontend) — beda dari decreaseStock/
 * increaseStock di atas yang berbasis selisih (dipakai alur checkout).
 * Selisihnya tetap dicatat ke stock_logs (type 'in'/'out') supaya Riwayat
 * Perubahan Stok & widget Stok Menipis tetap konsisten dengan satu sumber
 * data yang sama. Jika stok tidak berubah (stokBaru === stok saat ini),
 * tidak ada baris log baru yang dibuat.
 */
async function setVariantStock(variantId, stokBaru, meta = {}) {
  const { data: variant, error: fetchError } = await supabase
    .from("product_variants")
    .select("stok")
    .eq("id", variantId)
    .maybeSingle();
  if (fetchError) throw new AppError(fetchError.message, 500);
  if (!variant) throw new AppError("Varian tidak ditemukan", 404);

  const stokSebelum = variant.stok;
  const selisih = stokBaru - stokSebelum;
  if (selisih === 0) return { logged: false };

  const { error } = await supabase.from("product_variants").update({ stok: stokBaru }).eq("id", variantId);
  if (error) throw new AppError(error.message, 500);

  await logStock(variantId, selisih, selisih > 0 ? "in" : "out", { ...meta, stokSebelum, stokSesudah: stokBaru });
  return { logged: true, stokSebelum, stokSesudah: stokBaru, selisih };
}

async function logStock(variantId, quantity, type, meta = {}) {
  const { error } = await supabase.from("stock_logs").insert({
    variant_id: variantId,
    quantity,
    type,
    admin_id: meta.adminId ?? null,
    stok_sebelum: meta.stokSebelum ?? null,
    stok_sesudah: meta.stokSesudah ?? null,
  });
  if (error) throw new AppError(error.message, 500);
  return true;
}

/**
 * UPDATE — Halaman Inventory Stock Admin (Riwayat Perubahan Stok): setiap
 * baris log disertai nama produk, varian (ukuran/warna), dan nama admin yang
 * mengubah (kalau ada) supaya modal Riwayat tidak perlu request tambahan.
 */
async function findLogsByVariant(variantId) {
  const { data, error } = await supabase
    .from("stock_logs")
    .select(
      `*,
      product_variants ( ukuran, warna, sku, products ( nama_produk ) ),
      users ( nama_lengkap )`
    )
    .eq("variant_id", variantId)
    .order("created_at", { ascending: false });
  if (error) throw new AppError(error.message, 500);
  return data;
}

/**
 * UPDATE — Notifikasi Stok Menipis untuk Admin. `stock_settings` adalah tabel
 * single-row (id selalu 1) yang menyimpan Batas Minimum Stok.
 */
const DEFAULT_MINIMUM_STOCK = 15;

async function getMinimumStock() {
  const { data, error } = await supabase.from("stock_settings").select("minimum_stock").eq("id", 1).maybeSingle();
  if (error) throw new AppError(error.message, 500);
  return data?.minimum_stock ?? DEFAULT_MINIMUM_STOCK;
}

async function updateMinimumStock(minimumStock) {
  const { data, error } = await supabase
    .from("stock_settings")
    .upsert({ id: 1, minimum_stock: minimumStock, updated_at: new Date().toISOString() })
    .select("minimum_stock")
    .single();
  if (error) throw new AppError(error.message, 500);
  return data.minimum_stock;
}

/**
 * Mengambil seluruh varian dengan stok <= threshold, sekaligus data produk
 * induknya (nama, slug, status aktif), supaya bisa dikelompokkan per produk
 * di stockService (lihat getLowStockReport).
 */
async function findLowStockVariants(threshold) {
  const { data, error } = await supabase
    .from("product_variants")
    .select("id, ukuran, warna, sku, stok, product_id, products ( id, nama_produk, slug, is_active )")
    .lte("stok", threshold)
    .order("stok", { ascending: true });
  if (error) throw new AppError(error.message, 500);
  return data;
}

/**
 * UPDATE — Halaman Inventory Stock Admin.
 *
 * Satu baris = satu varian (bukan dikelompokkan per produk) supaya bisa
 * dipaginasi dengan aman walau satu produk punya puluhan varian — tabel di
 * frontend tetap menampilkan Nama Produk di tiap baris (lihat dokumen
 * permintaan bagian "TAMPILAN DATA").
 *
 * - `search` mencocokkan Nama Produk ATAU SKU (ILIKE, case-insensitive) lewat
 *   embedded resource `products!inner` + dot-notation (pola yang sama dengan
 *   transactionReportRepository.getSummary), supaya cukup satu query tanpa
 *   perlu mengambil daftar product_id yang cocok terlebih dahulu.
 * - `status` ('aman' | 'menipis' | 'habis') memfilter berdasarkan `stok` vs
 *   `minimumStock` yang berlaku (lihat stockService — statusForStock).
 * - Produk yang sudah dinonaktifkan (is_active = false) tidak ikut
 *   ditampilkan, konsisten dengan getLowStockReport.
 * - Pagination & filtering seluruhnya di database (.range()), TIDAK memuat
 *   seluruh varian ke frontend sesuai poin "Performa" pada dokumen permintaan.
 */
async function findInventory({ search, status, minimumStock, page = 1, pageSize = 20 } = {}) {
  let query = supabase
    .from("product_variants")
    .select(
      `id, ukuran, warna, sku, stok, product_id,
      products!inner ( id, nama_produk, slug, is_active, product_images ( image_url, warna, sort_order ) )`,
      { count: "exact" }
    )
    .eq("products.is_active", true);

  if (search) {
    const term = `%${search}%`;
    
    // Cari product_id yang cocok dengan search (berdasarkan nama_produk)
    const { data: matchedProducts } = await supabase
      .from("products")
      .select("id")
      .ilike("nama_produk", term);
      
    const productIds = matchedProducts?.map(p => p.id) || [];
    
    if (productIds.length > 0) {
      const idsString = `(${productIds.join(",")})`;
      query = query.or(`sku.ilike.${term},product_id.in.${idsString}`);
    } else {
      query = query.ilike("sku", term);
    }
  }

  if (status === "aman") query = query.gt("stok", minimumStock);
  else if (status === "menipis") query = query.gt("stok", 0).lte("stok", minimumStock);
  else if (status === "habis") query = query.eq("stok", 0);

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  query = query
    .order("nama_produk", { ascending: true, foreignTable: "products" })
    .order("warna", { ascending: true })
    .order("ukuran", { ascending: true })
    .range(from, to);

  const { data, error, count } = await query;
  if (error) throw new AppError(error.message, 500);
  return { data, total: count };
}

module.exports = {
  decreaseStock,
  increaseStock,
  setVariantStock,
  logStock,
  findLogsByVariant,
  getMinimumStock,
  updateMinimumStock,
  findLowStockVariants,
  findInventory,
};
