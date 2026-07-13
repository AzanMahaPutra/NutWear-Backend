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

module.exports = { decreaseStock, increaseStock, logStock, findLogsByVariant };
