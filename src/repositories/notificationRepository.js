const { supabase } = require("../config/supabase");
const { AppError } = require("../utils/AppError");

/**
 * Repository notifications — satu-satunya layer yang melakukan query ke tabel
 * `notifications`. Notifikasi disimpan per-user (fan-out saat insert untuk
 * notifikasi broadcast seperti New Arrival/Promo) supaya status baca/belum-baca
 * independen per user tanpa perlu tabel pivot tambahan.
 */

const PAGE_SIZE_DEFAULT = 20;

async function findAllByUser(userId, { page = 1, pageSize = PAGE_SIZE_DEFAULT } = {}) {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const { data, error, count } = await supabase
    .from("notifications")
    .select("*", { count: "exact" })
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .range(from, to);
  if (error) throw new AppError(error.message, 500);
  return { data, total: count };
}

async function countUnread(userId) {
  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("is_read", false);
  if (error) throw new AppError(error.message, 500);
  return count ?? 0;
}

/** Insert satu notifikasi untuk satu user (mis. update status pesanan). */
async function createForUser(userId, { type, title, message, link = null, referenceId = null }) {
  const { data, error } = await supabase
    .from("notifications")
    .insert({ user_id: userId, type, title, message, link, reference_id: referenceId })
    .select()
    .single();
  if (error) throw new AppError(error.message, 500);
  return data;
}

/** Insert notifikasi yang sama untuk banyak user sekaligus (broadcast New Arrival/Promo). */
async function createForUsers(userIds, { type, title, message, link = null, referenceId = null }) {
  if (!userIds.length) return [];
  const rows = userIds.map((userId) => ({
    user_id: userId,
    type,
    title,
    message,
    link,
    reference_id: referenceId,
  }));
  const { data, error } = await supabase.from("notifications").insert(rows).select();
  if (error) throw new AppError(error.message, 500);
  return data;
}

async function markRead(userId, id) {
  const { data, error } = await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("id", id)
    .eq("user_id", userId)
    .select()
    .maybeSingle();
  if (error) throw new AppError(error.message, 500);
  return data;
}

async function markAllRead(userId) {
  const { error } = await supabase.from("notifications").update({ is_read: true }).eq("user_id", userId).eq("is_read", false);
  if (error) throw new AppError(error.message, 500);
  return true;
}

module.exports = {
  findAllByUser,
  countUnread,
  createForUser,
  createForUsers,
  markRead,
  markAllRead,
};
