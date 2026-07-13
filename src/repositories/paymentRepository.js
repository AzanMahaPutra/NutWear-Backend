const { supabase } = require("../config/supabase");
const { AppError } = require("../utils/AppError");

async function create({ orderId, midtransOrderId, grossAmount, snapToken }) {
  const { data, error } = await supabase
    .from("payments")
    .insert({
      order_id: orderId,
      midtrans_order_id: midtransOrderId,
      gross_amount: grossAmount,
      snap_token: snapToken,
      transaction_status: "pending",
    })
    .select()
    .single();
  if (error) throw new AppError(error.message, 500);
  return data;
}

async function findByOrderId(orderId) {
  const { data, error } = await supabase.from("payments").select("*").eq("order_id", orderId).maybeSingle();
  if (error) throw new AppError(error.message, 500);
  return data;
}

async function updateByOrderId(orderId, fields) {
  const { data, error } = await supabase.from("payments").update(fields).eq("order_id", orderId).select().maybeSingle();
  if (error) throw new AppError(error.message, 500);
  return data;
}

module.exports = { create, findByOrderId, updateByOrderId };
