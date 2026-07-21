const { supabase } = require("../config/supabase");
const { AppError } = require("../utils/AppError");

async function decreaseStock(variantId, quantity) {
  const { data: variant, error: fetchError } = await supabase
    .from("product_variants")
    .select("stok")
    .eq("id", variantId)
    .maybeSingle();
  if (fetchError) throw new AppError(fetchError.message, 500);
  if (!variant || variant.stok < quantity) {
    throw new AppError("Stok tidak mencukupi untuk salah satu produk", 400);
  }

  const { error } = await supabase
    .from("product_variants")
    .update({ stok: variant.stok - quantity })
    .eq("id", variantId);
  if (error) throw new AppError(error.message, 500);

  return logStock(variantId, -quantity, "out");
}

async function increaseStock(variantId, quantity) {
  const { data: variant, error: fetchError } = await supabase
    .from("product_variants")
    .select("stok")
    .eq("id", variantId)
    .maybeSingle();
  if (fetchError) throw new AppError(fetchError.message, 500);

  const { error } = await supabase
    .from("product_variants")
    .update({ stok: (variant?.stok || 0) + quantity })
    .eq("id", variantId);
  if (error) throw new AppError(error.message, 500);

  return logStock(variantId, quantity, "in");
}

async function logStock(variantId, quantity, type) {
  const { error } = await supabase.from("stock_logs").insert({ variant_id: variantId, quantity, type });
  if (error) throw new AppError(error.message, 500);
  return true;
}

async function findLogsByVariant(variantId) {
  const { data, error } = await supabase
    .from("stock_logs")
    .select("*")
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

module.exports = {
  decreaseStock,
  increaseStock,
  logStock,
  findLogsByVariant,
  getMinimumStock,
  updateMinimumStock,
  findLowStockVariants,
};
