const { supabase } = require("../config/supabase");
const { AppError } = require("../utils/AppError");

const ORDER_SELECT = `
  *,
  order_items ( id, variant_id, product_id, quantity, price,
    product_name, product_slug, variant_sku, variant_ukuran, variant_warna, image_url,
    product_variants ( ukuran, warna, sku,
      products ( nama_produk, slug, product_images ( image_url, sort_order ) )
    )
  ),
  payments ( * ),
  user_addresses ( receiver_name, phone, province, city, district, postal_code, address ),
  users ( nama_lengkap, email, no_hp ),
  reviews ( id, product_id, order_item_id, rating, comment )
`;

/**
 * Status pesanan yang boleh ikut dihapus lewat tombol "Hapus Semua" di halaman
 * Pesanan Admin — hanya pesanan yang sudah final/tidak aktif lagi (lihat
 * orderService.deleteOrdersByFilter untuk validasi pesan error-nya).
 */
const BULK_DELETE_ALLOWED_STATUSES = ["selesai", "dibatalkan", "expired"];

/**
 * Membangun rentang tanggal (created_at) dari kombinasi filter tanggal/bulan/tahun.
 * Prioritas: `date` (tanggal spesifik) > `month`(+`year`) > `year` saja.
 */
function buildDateRange({ date, month, year }) {
  if (date) {
    const start = new Date(`${date}T00:00:00.000Z`);
    if (Number.isNaN(start.getTime())) return null;
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);
    return { start: start.toISOString(), end: end.toISOString() };
  }

  if (month) {
    const y = year ? Number(year) : new Date().getFullYear();
    const m = Number(month);
    const start = new Date(Date.UTC(y, m - 1, 1));
    const end = new Date(Date.UTC(y, m, 1));
    return { start: start.toISOString(), end: end.toISOString() };
  }

  if (year) {
    const y = Number(year);
    const start = new Date(Date.UTC(y, 0, 1));
    const end = new Date(Date.UTC(y + 1, 0, 1));
    return { start: start.toISOString(), end: end.toISOString() };
  }

  return null;
}

/**
 * UPDATE — Search Order ID: cocokkan `search` secara partial & case-insensitive
 * terhadap Order ID (kolom `id`, uuid). Dicasting ke text (`id::text`) lewat sintaks
 * casting kolom PostgREST supaya operator ILIKE bisa dipakai pada kolom uuid, dan
 * memanfaatkan index trigram `orders_id_text_trgm_idx` (lihat migration terkait)
 * supaya tetap cepat walaupun jumlah pesanan sudah sangat banyak.
 */
function applySearch(query, search) {
  const term = (search || "").trim();
  if (!term) return query;
  return query.ilike("id_text", `%${term}%`);
}

/** Menerapkan filter tanggal/bulan/tahun, status, & search Order ID ke query builder Supabase. */
function applyFilters(query, { date, month, year, status, search }) {
  const range = buildDateRange({ date, month, year });
  if (range) {
    query = query.gte("created_at", range.start).lt("created_at", range.end);
  }
  if (status) {
    query = query.eq("status", status);
  }
  query = applySearch(query, search);
  return query;
}

async function findAllByUser(userId) {
  const { data, error } = await supabase
    .from("orders")
    .select(ORDER_SELECT)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw new AppError(error.message, 500);
  return data;
}

/** UPDATE — Manajemen User: total pesanan per user untuk kolom "Total Pesanan"
 * di halaman Manajemen User Admin. Hanya menghitung (head:true), tidak mengambil data. */
async function countByUser(userId) {
  const { count, error } = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (error) throw new AppError(error.message, 500);
  return count || 0;
}

async function findAll(filters = {}) {
  let query = supabase.from("orders").select(ORDER_SELECT).order("created_at", { ascending: false });
  query = applyFilters(query, filters);
  const { data, error } = await query;
  if (error) throw new AppError(error.message, 500);
  return data;
}

/**
 * UPDATE — Search Order ID (autocomplete): daftar Order ID ringkas yang cocok dengan
 * `term` untuk ditampilkan di dropdown. Sengaja hanya select kolom yang dibutuhkan
 * (bukan ORDER_SELECT lengkap dengan seluruh relasi) + `limit` kecil supaya tetap
 * responsif walaupun jumlah pesanan sudah sangat banyak.
 */
async function searchSuggestions(term, limit = 8) {
  let query = supabase
    .from("orders")
    .select("id, created_at, status, users ( nama_lengkap )")
    .order("created_at", { ascending: false })
    .limit(limit);
  query = applySearch(query, term);
  const { data, error } = await query;
  if (error) throw new AppError(error.message, 500);
  return data;
}

async function findById(id) {
  const { data, error } = await supabase.from("orders").select(ORDER_SELECT).eq("id", id).maybeSingle();
  if (error) throw new AppError(error.message, 500);
  return data;
}

async function findByMidtransOrderId(midtransOrderId) {
  const { data, error } = await supabase
    .from("payments")
    .select("order_id")
    .eq("midtrans_order_id", midtransOrderId)
    .maybeSingle();
  if (error) throw new AppError(error.message, 500);
  return data ? findById(data.order_id) : null;
}

async function createOrder({ userId, addressId, totalPrice, shippingCost, grandTotal }) {
  const { data, error } = await supabase
    .from("orders")
    .insert({
      user_id: userId,
      address_id: addressId,
      total_price: totalPrice,
      shipping_cost: shippingCost,
      grand_total: grandTotal,
      status: "menunggu_pembayaran",
    })
    .select()
    .single();
  if (error) throw new AppError(error.message, 500);
  return data;
}

async function createOrderItems(items) {
  const { error } = await supabase.from("order_items").insert(items);
  if (error) throw new AppError(error.message, 500);
  return true;
}

async function updateStatus(orderId, status) {
  const { data, error } = await supabase
    .from("orders")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", orderId)
    .select()
    .maybeSingle();
  if (error) throw new AppError(error.message, 500);
  return data;
}

/**
 * Membatalkan pesanan atas inisiatif user sendiri lewat tombol "Batalkan Pesanan"
 * di Riwayat Pesanan (Update 2, poin 1-3). Mengubah status menjadi "dibatalkan"
 * dan mencatat cancelled_by = "user" supaya admin tahu pesanan dibatalkan oleh user
 * (poin 7), bukan lewat ubah status manual di halaman Admin.
 *
 * Syarat `.eq("status", "menunggu_pembayaran")` adalah guard tambahan di level
 * query (selain pengecekan di service) untuk mencegah race condition — jika status
 * pesanan sudah berubah (mis. baru saja dibayar) di antara pengecekan dan update ini,
 * query tidak akan mengubah apa pun dan mengembalikan null.
 */
async function cancelByUser(orderId) {
  const { data, error } = await supabase
    .from("orders")
    .update({ status: "dibatalkan", cancelled_by: "user", updated_at: new Date().toISOString() })
    .eq("id", orderId)
    .eq("status", "menunggu_pembayaran")
    .select()
    .maybeSingle();
  if (error) throw new AppError(error.message, 500);
  return data;
}

/** Menghapus satu pesanan. order_items & payments ikut terhapus (on delete cascade). */
async function deleteOrder(id) {
  const { error } = await supabase.from("orders").delete().eq("id", id);
  if (error) throw new AppError(error.message, 500);
  return true;
}

/**
 * Menghapus seluruh pesanan yang cocok dengan filter tanggal/bulan/tahun/status
 * yang sedang aktif di halaman Admin, dibatasi hanya status pada `allowedStatuses`
 * (lihat orderService.deleteOrdersByFilter untuk validasi status yang diminta).
 * Mengembalikan jumlah baris yang terhapus.
 */
async function deleteManyByFilter({ date, month, year, status, allowedStatuses = BULK_DELETE_ALLOWED_STATUSES }) {
  let query = supabase.from("orders").delete();
  query = applyFilters(query, { date, month, year });

  if (status) {
    query = query.eq("status", status);
  } else {
    query = query.in("status", allowedStatuses);
  }

  const { data, error } = await query.select("id");
  if (error) throw new AppError(error.message, 500);
  return data ? data.length : 0;
}

module.exports = {
  BULK_DELETE_ALLOWED_STATUSES,
  // UPDATE — Laporan Transaksi & Export Excel: ORDER_SELECT diekspor supaya
  // transactionReportRepository bisa memakai bentuk query (order_items + payments +
  // alamat + data user) yang SAMA PERSIS dengan halaman Pesanan Admin, bukan menulis
  // ulang string select yang panjang secara terpisah. Tidak mengubah perilaku apa pun
  // di sini — murni penambahan pada module.exports.
  ORDER_SELECT,
  findAllByUser,
  countByUser,
  findAll,
  findById,
  searchSuggestions,
  findByMidtransOrderId,
  createOrder,
  createOrderItems,
  updateStatus,
  cancelByUser,
  deleteOrder,
  deleteManyByFilter,
};
