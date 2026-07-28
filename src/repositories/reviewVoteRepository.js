const { supabase } = require("../config/supabase");
const { AppError } = require("../utils/AppError");

/**
 * Repository review_votes (UPDATE — Review Helpful). Satu-satunya layer yang
 * melakukan query ke tabel `review_votes`. Lihat migration
 * 20260727_add_review_helpful_votes.sql untuk struktur tabel.
 */

/**
 * Batch: jumlah vote "membantu" & "tidak_membantu" untuk banyak review sekaligus
 * (satu query untuk seluruh review pada halaman, bukan satu query per review).
 * Mengembalikan map { [reviewId]: { membantu, tidakMembantu } }, hanya untuk
 * review yang benar-benar sudah punya vote — pemanggil wajib fallback ke
 * { membantu: 0, tidakMembantu: 0 }.
 */
async function getCountsForReviews(reviewIds) {
  if (!reviewIds || reviewIds.length === 0) return {};
  const { data, error } = await supabase.from("review_votes").select("review_id, vote").in("review_id", reviewIds);
  if (error) throw new AppError(error.message, 500);

  const result = {};
  data.forEach((row) => {
    const bucket = result[row.review_id] || { membantu: 0, tidakMembantu: 0 };
    if (row.vote === "membantu") bucket.membantu += 1;
    else if (row.vote === "tidak_membantu") bucket.tidakMembantu += 1;
    result[row.review_id] = bucket;
  });
  return result;
}

/**
 * Batch: pilihan vote milik SATU user (yang sedang login) untuk banyak review
 * sekaligus. Mengembalikan map { [reviewId]: "membantu" | "tidak_membantu" }.
 * Tidak dipanggil sama sekali kalau user belum login (lihat reviewService).
 */
async function getUserVotesForReviews(reviewIds, userId) {
  if (!reviewIds || reviewIds.length === 0 || !userId) return {};
  const { data, error } = await supabase
    .from("review_votes")
    .select("review_id, vote")
    .in("review_id", reviewIds)
    .eq("user_id", userId);
  if (error) throw new AppError(error.message, 500);

  const result = {};
  data.forEach((row) => {
    result[row.review_id] = row.vote;
  });
  return result;
}

/**
 * Membuat vote baru ATAU mengganti pilihan vote yang sudah ada (satu user
 * hanya boleh punya satu baris per review — lihat unique index
 * (review_id, user_id) di migration). onConflict memastikan ini benar-benar
 * UPDATE, bukan gagal dengan error duplicate key.
 */
async function upsert(reviewId, userId, vote) {
  const { data, error } = await supabase
    .from("review_votes")
    .upsert(
      { review_id: reviewId, user_id: userId, vote, updated_at: new Date().toISOString() },
      { onConflict: "review_id,user_id" }
    )
    .select()
    .single();
  if (error) throw new AppError(error.message, 500);
  return data;
}

/** Menghapus vote milik user pada satu review (dipakai saat user membatalkan pilihannya). */
async function remove(reviewId, userId) {
  const { error } = await supabase.from("review_votes").delete().eq("review_id", reviewId).eq("user_id", userId);
  if (error) throw new AppError(error.message, 500);
  return true;
}

module.exports = {
  getCountsForReviews,
  getUserVotesForReviews,
  upsert,
  remove,
};
