const reviewRepository = require("../repositories/reviewRepository");
const orderRepository = require("../repositories/orderRepository");
const reviewVoteRepository = require("../repositories/reviewVoteRepository");
const productRepository = require("../repositories/productRepository");
const notificationService = require("./notificationService");
const { AppError } = require("../utils/AppError");

/**
 * UPDATE 7 — `purchaseInfo` diambil dari order_items (lewat order_item_id) yang
 * menjadi sumber ulasan ini, bukan data statis/hardcode. Bernilai null untuk
 * ulasan lama (dibuat sebelum UPDATE 7) yang belum tercatat order_item_id-nya.
 *
 * UPDATE — Review Helpful & Balasan Admin: `voteContext` (opsional) berisi
 * jumlah vote & pilihan vote user yang sedang login untuk review ini —
 * dihitung terpisah di getReviewsByProduct (batch, lihat komentar di sana)
 * supaya toResponse tetap murni fungsi mapping tanpa query tambahan sendiri.
 * Review yang belum punya vote sama sekali otomatis fallback ke 0/0/null.
 */
function toResponse(review, voteContext = {}) {
  const productImages = (review.products?.product_images || []).sort((a, b) => a.sort_order - b.sort_order);
  const productVariants = review.products?.product_variants || [];
  const purchasedItem = review.order_items || null;
  const { voteCounts, myVote } = voteContext;

  return {
    id: review.id,
    productId: review.product_id,
    productName: review.products?.nama_produk,
    productSku: productVariants[0]?.sku ?? null,
    productThumbnail: productImages[0]?.image_url ?? null,
    userName: review.users?.nama_lengkap,
    rating: review.rating,
    comment: review.comment,
    createdAt: review.created_at,
    orderId: review.order_id ?? null,
    // UPDATE — Moderasi Review: status "ditampilkan" | "disembunyikan".
    status: review.status ?? "ditampilkan",
    purchaseInfo: purchasedItem
      ? {
          productName: purchasedItem.product_name ?? null,
          ukuran: purchasedItem.variant_ukuran ?? null,
          warna: purchasedItem.variant_warna ?? null,
          quantity: purchasedItem.quantity ?? null,
        }
      : null,
    // UPDATE — Review Helpful: jumlah vote "Membantu"/"Tidak Membantu" +
    // pilihan vote milik user yang sedang login (null kalau belum login/belum vote).
    helpfulVotes: {
      membantu: voteCounts?.membantu ?? 0,
      tidakMembantu: voteCounts?.tidakMembantu ?? 0,
    },
    myVote: myVote ?? null,
    // UPDATE — Balasan Review oleh Admin: null kalau review ini belum dibalas.
    adminReply: review.admin_reply
      ? {
          message: review.admin_reply,
          repliedAt: review.admin_reply_at,
          repliedByName: review.admin_replier?.nama_lengkap ?? "NutWear Official",
        }
      : null,
  };
}

/**
 * UPDATE — Review Helpful: `currentUserId` opsional — hanya diisi kalau
 * request datang dari user yang sedang login (lewat middleware
 * attachUserIfPresent, lihat reviewRoutes.js), supaya pengunjung yang belum
 * login tetap bisa melihat review + jumlah vote seperti biasa, hanya tanpa
 * `myVote` (selalu null). Jumlah vote & vote user dihitung batch (satu query
 * masing-masing untuk seluruh review produk ini), bukan satu query per review.
 */
async function getReviewsByProduct(productId, currentUserId) {
  const reviews = await reviewRepository.findByProduct(productId);
  const summary = await reviewRepository.getAverageRating(productId);

  const reviewIds = reviews.map((r) => r.id);
  const [voteCountsMap, myVotesMap] = await Promise.all([
    reviewVoteRepository.getCountsForReviews(reviewIds),
    currentUserId ? reviewVoteRepository.getUserVotesForReviews(reviewIds, currentUserId) : {},
  ]);

  const items = reviews.map((review) =>
    toResponse(review, { voteCounts: voteCountsMap[review.id], myVote: myVotesMap[review.id] })
  );
  return { items, summary };
}

// UPDATE — Filter Review berdasarkan Produk (Review Admin): `productId` diteruskan
// ke reviewRepository.findAll supaya filter dilakukan di database, bukan di frontend.
// UPDATE — Search & Filter Kategori (Review Admin): `categoryId` & `search`
// (Nama Produk/SKU/Nama User) juga diteruskan apa adanya — seluruh logika
// pencarian ada di reviewRepository.findAll, service ini hanya meneruskan.
async function getAllReviews({ rating, productId, categoryId, search } = {}) {
  const reviews = await reviewRepository.findAll({ rating, productId, categoryId, search });
  return reviews.map(toResponse);
}

/**
 * UPDATE 7 — Ulasan sekarang hanya boleh dibuat dari sebuah pesanan (order)
 * yang benar-benar berisi produk tersebut & sudah berstatus "Selesai". Seluruh
 * validasi dilakukan di backend (tidak mengandalkan frontend) supaya request
 * manual yang tidak memenuhi syarat tetap ditolak API:
 * 1. Pesanan harus ada & milik user yang sedang login.
 * 2. Status pesanan harus "selesai".
 * 3. orderItemId harus benar-benar salah satu item pada pesanan tersebut,
 *    dan productId yang dikirim harus sesuai dengan produk pada item itu.
 * 4. User belum pernah membuat ulasan untuk produk ini pada pesanan yang sama
 *    (satu ulasan per produk per pesanan — lihat juga unique index database
 *    reviews_order_product_unique sebagai jaring pengaman race condition).
 */
async function createReview(userId, { orderId, orderItemId, productId, rating, comment }) {
  const order = await orderRepository.findById(orderId);
  if (!order || order.user_id !== userId) {
    throw new AppError("Pesanan tidak ditemukan", 404);
  }

  if (order.status !== "selesai") {
    throw new AppError("Ulasan hanya dapat diberikan untuk pesanan yang berstatus Selesai", 400);
  }

  const orderItem = (order.order_items || []).find((oi) => oi.id === orderItemId);
  if (!orderItem) {
    throw new AppError("Item pesanan tidak ditemukan pada pesanan ini", 404);
  }
  if (orderItem.product_id !== productId) {
    throw new AppError("Produk tidak sesuai dengan item pesanan yang dipilih", 400);
  }

  const existing = await reviewRepository.findByOrderAndProduct(orderId, productId);
  if (existing) {
    throw new AppError(
      "Anda sudah memberi ulasan untuk produk ini pada pesanan tersebut. Silakan gunakan fitur Edit Ulasan.",
      409
    );
  }

  const review = await reviewRepository.create({ userId, productId, orderId, orderItemId, rating, comment });
  const full = await reviewRepository.findById(review.id);
  return toResponse(full);
}

/**
 * UPDATE 7 — Edit Ulasan: melakukan UPDATE terhadap review yang sudah ada,
 * tidak pernah membuat baris review baru. Hanya pemilik ulasan yang boleh
 * mengeditnya.
 */
async function updateReview(userId, reviewId, { rating, comment }) {
  const review = await reviewRepository.findById(reviewId);
  if (!review) throw new AppError("Ulasan tidak ditemukan", 404);
  if (review.user_id !== userId) {
    throw new AppError("Anda tidak memiliki akses untuk mengubah ulasan ini", 403);
  }

  const updated = await reviewRepository.update(reviewId, { rating, comment });
  const full = await reviewRepository.findById(updated.id);
  return toResponse(full);
}

async function deleteReview(id) {
  await reviewRepository.deleteById(id);
  return true;
}

/**
 * UPDATE — Moderasi Review: Admin menyembunyikan/menampilkan review tanpa
 * menghapusnya dari database. Review tidak ditemukan -> 404.
 */
async function setReviewStatus(id, status) {
  if (!["ditampilkan", "disembunyikan"].includes(status)) {
    throw new AppError("Status review tidak valid", 400);
  }

  const existing = await reviewRepository.findById(id);
  if (!existing) throw new AppError("Ulasan tidak ditemukan", 404);

  const updated = await reviewRepository.updateStatus(id, status);
  const full = await reviewRepository.findById(updated.id);
  return toResponse(full);
}

/**
 * UPDATE — Review Helpful: memberi vote baru ATAU mengganti pilihan vote yang
 * sudah ada (satu user hanya boleh punya satu vote per review — lihat unique
 * index review_id+user_id di database). Mengembalikan jumlah vote terbaru
 * supaya frontend langsung tahu angka yang benar tanpa perlu refetch seluruh
 * daftar review.
 */
async function setVote(userId, reviewId, vote) {
  if (!["membantu", "tidak_membantu"].includes(vote)) {
    throw new AppError("Pilihan vote tidak valid", 400);
  }

  const review = await reviewRepository.findById(reviewId);
  if (!review) throw new AppError("Ulasan tidak ditemukan", 404);

  await reviewVoteRepository.upsert(reviewId, userId, vote);
  const counts = await reviewVoteRepository.getCountsForReviews([reviewId]);
  const voteCounts = counts[reviewId] ?? { membantu: 0, tidakMembantu: 0 };

  return {
    reviewId,
    helpfulVotes: voteCounts,
    myVote: vote,
  };
}

/**
 * UPDATE — Review Helpful: user membatalkan/menghapus vote miliknya sendiri
 * pada satu review. Jumlah vote ikut diperbarui (dihitung ulang dari data
 * asli, bukan dikurangi manual) supaya selalu akurat.
 */
async function removeVote(userId, reviewId) {
  const review = await reviewRepository.findById(reviewId);
  if (!review) throw new AppError("Ulasan tidak ditemukan", 404);

  await reviewVoteRepository.remove(reviewId, userId);
  const counts = await reviewVoteRepository.getCountsForReviews([reviewId]);
  const voteCounts = counts[reviewId] ?? { membantu: 0, tidakMembantu: 0 };

  return {
    reviewId,
    helpfulVotes: voteCounts,
    myVote: null,
  };
}

/**
 * UPDATE — Balasan Review oleh Admin: membuat balasan baru ATAU mengedit
 * balasan yang sudah ada (keduanya lewat fungsi yang sama — UPDATE terhadap
 * kolom admin_reply* pada baris review yang sama, sesuai aturan "setiap
 * review maksimal satu balasan resmi"). Mengirim notifikasi ke pemilik review
 * setelah balasan berhasil disimpan (fire-and-forget, tidak boleh membuat
 * balasan gagal tersimpan hanya karena notifikasi gagal terkirim).
 */
async function replyToReview(adminId, reviewId, message) {
  const review = await reviewRepository.findById(reviewId);
  if (!review) throw new AppError("Ulasan tidak ditemukan", 404);

  const updated = await reviewRepository.setAdminReply(reviewId, { message, adminId });
  const full = await reviewRepository.findById(updated.id);

  const product = await productRepository.findById(review.product_id).catch(() => null);
  if (product) {
    notificationService
      .notifyReviewReplied({
        userId: review.user_id,
        reviewId: review.id,
        productName: product.nama_produk,
        productSlug: product.slug,
      })
      .catch(() => {});
  }

  return toResponse(full);
}

/**
 * UPDATE — Balasan Review oleh Admin: Hapus Balasan. Review tetap ada, hanya
 * kolom balasan yang dikosongkan kembali — tidak mengirim notifikasi baru
 * (hanya balasan baru/diedit yang dikirim notifikasi ke user).
 */
async function deleteReply(reviewId) {
  const review = await reviewRepository.findById(reviewId);
  if (!review) throw new AppError("Ulasan tidak ditemukan", 404);

  const updated = await reviewRepository.removeAdminReply(reviewId);
  const full = await reviewRepository.findById(updated.id);
  return toResponse(full);
}

module.exports = {
  getReviewsByProduct,
  getAllReviews,
  createReview,
  updateReview,
  deleteReview,
  setReviewStatus,
  setVote,
  removeVote,
  replyToReview,
  deleteReply,
};
