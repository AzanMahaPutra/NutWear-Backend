const { v4: uuidv4 } = require("uuid");
const orderRepository = require("../repositories/orderRepository");
const paymentRepository = require("../repositories/paymentRepository");
const cartRepository = require("../repositories/cartRepository");
const productRepository = require("../repositories/productRepository");
const addressRepository = require("../repositories/addressRepository");
const stockRepository = require("../repositories/stockRepository");
const userRepository = require("../repositories/userRepository");
const shippingService = require("./shippingService");
const notificationService = require("./notificationService");
const midtrans = require("../utils/midtrans");
const { AppError } = require("../utils/AppError");
const promo = require("../utils/promo");
const env = require("../config/env");

/**
 * Mengubah row order (+ order_items + payments) dari database menjadi bentuk response API.
 *
 * Detail tiap item mengutamakan kolom snapshot (product_name, variant_sku, dst — diisi
 * saat checkout) dan hanya jatuh ke data live product_variants/products sebagai fallback
 * (mis. untuk order lama sebelum migration snapshot dijalankan). Dengan begini, detail
 * pesanan tetap utuh walau Produk/Variant aslinya sudah dihapus admin.
 */
function toResponse(order) {
  return {
    id: order.id,
    userId: order.user_id,
    addressId: order.address_id,
    totalPrice: order.total_price,
    shippingCost: order.shipping_cost,
    grandTotal: order.grand_total,
    status: order.status,
    createdAt: order.created_at,
    items: (order.order_items || []).map((oi) => {
      const variantThumbnail = (oi.product_variants?.products?.product_images || []).sort(
        (a, b) => a.sort_order - b.sort_order
      )[0]?.image_url;

      // UPDATE 7 — Sistem Ulasan Produk berbasis Pesanan: sertakan productId
      // (snapshot, independen dari variant_id yang bisa NULL) & ulasan yang
      // sudah pernah dibuat user untuk produk ini pada pesanan ini (kalau ada),
      // supaya Riwayat Pesanan/Detail Pesanan tahu harus menampilkan tombol
      // "Beri Ulasan" atau "Edit Ulasan" tanpa perlu request tambahan.
      const review = (order.reviews || []).find((r) => r.product_id === oi.product_id) ?? null;

      return {
        id: oi.id,
        variantId: oi.variant_id,
        productId: oi.product_id ?? null,
        quantity: oi.quantity,
        price: oi.price,
        ukuran: oi.variant_ukuran ?? oi.product_variants?.ukuran,
        warna: oi.variant_warna ?? oi.product_variants?.warna,
        sku: oi.variant_sku ?? oi.product_variants?.sku,
        namaProduk: oi.product_name ?? oi.product_variants?.products?.nama_produk,
        slug: oi.product_slug ?? oi.product_variants?.products?.slug,
        imageUrl: oi.image_url ?? variantThumbnail ?? null,
        review: review ? { id: review.id, rating: review.rating, comment: review.comment } : null,
      };
    }),
    shippingAddress: order.user_addresses
      ? {
          receiverName: order.user_addresses.receiver_name,
          phone: order.user_addresses.phone,
          province: order.user_addresses.province,
          city: order.user_addresses.city,
          district: order.user_addresses.district,
          postalCode: order.user_addresses.postal_code,
          address: order.user_addresses.address,
        }
      : null,
    customer: order.users
      ? {
          namaLengkap: order.users.nama_lengkap,
          email: order.users.email,
          noHp: order.users.no_hp,
        }
      : null,
    payment: order.payments
      ? (Array.isArray(order.payments) ? order.payments[0] : order.payments)
        ? {
            transactionStatus: (Array.isArray(order.payments) ? order.payments[0] : order.payments).transaction_status,
            paymentType: (Array.isArray(order.payments) ? order.payments[0] : order.payments).payment_type,
            snapToken: (Array.isArray(order.payments) ? order.payments[0] : order.payments).snap_token,
            paidAt: (Array.isArray(order.payments) ? order.payments[0] : order.payments).paid_at,
          }
        : null
      : null,
    // Update 2, poin 7 — dipakai admin di halaman Manajemen Pesanan untuk membedakan
    // pesanan yang dibatalkan sendiri oleh user lewat tombol "Batalkan Pesanan"
    // (cancelled_by = "user") dari pesanan yang dibatalkan lewat ubah status manual admin.
    cancelledBy: order.cancelled_by ?? null,
  };
}

/**
 * Alur checkout sesuai dokumen:
 * 1. Ambil isi keranjang user dari DB (bukan dari body request — mencegah manipulasi harga di client).
 * 2. Validasi stok & harga tiap item terhadap data produk terkini.
 * 3. Validasi alamat pengiriman milik user.
 * 4. Hitung ongkir (shippingService — otoritatif di backend).
 * 5. Buat order + order_items (snapshot lengkap tiap item, lihat toResponse di atas).
 * 6. UPDATE 8 — Item keranjang yang diproses TIDAK langsung dihapus di sini lagi.
 *    Sebelumnya (Update 2) item langsung dibuang begitu order dibuat, sebelum
 *    pembayaran selesai — kalau pembayaran gagal/terputus, item itu sudah hilang
 *    dari keranjang tanpa pesanan pernah lunas. Sekarang item baru dihapus dari
 *    keranjang setelah pembayaran BENAR-BENAR berhasil (lihat clearCartForPaidOrder,
 *    dipanggil dari Webhook Midtrans & dari admin yang menandai pesanan Sudah Dibayar
 *    secara manual). Selama menunggu pembayaran, item tetap terlihat di keranjang.
 * 7. Kurangi stok tiap varian (+ stock_logs).
 * 8. Minta Snap Token ke Midtrans, simpan di tabel payments.
 */
async function checkout(userId, { addressId, cartItemIds }) {
  const address = await addressRepository.findById(addressId);
  if (!address || address.user_id !== userId) {
    throw new AppError("Alamat pengiriman tidak valid", 400);
  }

  let cartItems = await cartRepository.findAllByUser(userId);
  if (cartItems.length === 0) {
    throw new AppError("Keranjang belanja kosong", 400);
  }

  // Update 5, Bagian B — fitur check item pada Cart: jika frontend mengirim cartItemIds
  // (item yang dicentang user), hanya item tersebut yang diproses menjadi pesanan.
  // Item keranjang lain yang tidak dicentang tidak ikut diproses/dihapus.
  if (Array.isArray(cartItemIds) && cartItemIds.length > 0) {
    const idSet = new Set(cartItemIds);
    cartItems = cartItems.filter((item) => idSet.has(item.id));
    if (cartItems.length === 0) {
      throw new AppError("Produk yang dipilih tidak ditemukan di keranjang", 400);
    }
  }

  let totalPrice = 0;
  let totalWeight = 0;
  const validatedItems = [];

  for (const item of cartItems) {
    const variant = item.product_variants;
    const product = variant?.products;
    if (!variant || !product) throw new AppError("Salah satu produk di keranjang tidak lagi tersedia", 400);
    if (variant.stok < item.quantity) {
      throw new AppError(`Stok tidak mencukupi untuk ${product.nama_produk} (${variant.ukuran}/${variant.warna})`, 400);
    }

    // Harga diambil ulang dari database (bukan dari cache frontend) — mencegah manipulasi harga.
    // UPDATE 3 — pakai harga EFEKTIF (harga promo kalau promo masih aktif, harga normal
    // kalau tidak) lewat util promo yang sama dipakai productService/cartService, supaya
    // Subtotal, Total Checkout, dan snapshot price di order_items konsisten dengan harga
    // yang ditampilkan di Card Produk/Detail Produk/Cart saat item ini dimasukkan.
    const hargaSaatIni = promo.getEffectivePrice(product);
    totalPrice += hargaSaatIni * item.quantity;
    totalWeight += (product.berat || 200) * item.quantity;

    const thumbnail = (product.product_images || []).sort((a, b) => a.sort_order - b.sort_order)[0]?.image_url ?? null;

    validatedItems.push({
      variantId: variant.id,
      productId: product.id,
      quantity: item.quantity,
      price: hargaSaatIni,
      namaProduk: product.nama_produk,
      slug: product.slug,
      sku: variant.sku,
      ukuran: variant.ukuran,
      warna: variant.warna,
      imageUrl: thumbnail,
    });
  }

  const shippingCost = shippingService.calculateShippingCost(totalWeight);
  const grandTotal = totalPrice + shippingCost;

  const order = await orderRepository.createOrder({
    userId,
    addressId,
    totalPrice,
    shippingCost,
    grandTotal,
  });

  await orderRepository.createOrderItems(
    validatedItems.map((i) => ({
      order_id: order.id,
      variant_id: i.variantId,
      product_id: i.productId,
      quantity: i.quantity,
      price: i.price,
      product_name: i.namaProduk,
      product_slug: i.slug,
      variant_sku: i.sku,
      variant_ukuran: i.ukuran,
      variant_warna: i.warna,
      image_url: i.imageUrl,
    }))
  );

  // UPDATE 8 — cart TIDAK lagi dihapus di sini (lihat clearCartForPaidOrder, dipanggil
  // setelah pembayaran benar-benar berhasil lewat Webhook Midtrans / admin).

  // Kurangi stok + catat stock_logs untuk setiap item (sesuai alur sistem poin 7).
  for (const item of validatedItems) {
    await stockRepository.decreaseStock(item.variantId, item.quantity);
  }

  const user = await userRepository.findById(userId);
  const midtransOrderId = `NUTWEAR-${order.id.slice(0, 8)}-${uuidv4().slice(0, 6)}`;

  // BUG 1 — tanpa callbacks.finish, Snap memakai Finish Redirect URL bawaan Midtrans
  // (https://example.com). BUG 5 — menyertakan order id supaya frontend bisa langsung
  // membuka Detail Pesanan yang baru saja dibayar begitu user kembali ke Riwayat Pesanan.
  const finishRedirectUrl = `${env.frontendUrl}/profile/riwayat-pesanan?order=${order.id}`;

  // BUG 1 — sebelumnya customerDetails hanya berisi first_name/email/phone, tanpa
  // billing_address maupun shipping_address, sehingga halaman Midtrans (Rincian
  // Pelanggan) tidak pernah menampilkan alamat user. Sistem ini tidak punya alamat
  // penagihan terpisah dari alamat pengiriman, jadi billing_address memakai alamat
  // yang sama dengan shipping_address — yaitu `address` yang sudah divalidasi milik
  // user & sedang dipilih di Checkout (bukan alamat pertama/default secara otomatis).
  // Field mengikuti skema Customer Details Midtrans Snap API (billing/shipping_address
  // tidak punya field "province" tersendiri, jadi provinsi disertakan di dalam
  // `address` supaya tetap tampil lengkap di Rincian Pelanggan Midtrans).
  const midtransAddress = {
    first_name: address.receiver_name,
    phone: address.phone,
    address: [address.address, address.district, address.province].filter(Boolean).join(", "),
    city: address.city,
    postal_code: address.postal_code,
    country_code: "IDN",
  };

  let snapToken;
  try {
    snapToken = await midtrans.createSnapTransaction({
      midtransOrderId,
      grossAmount: grandTotal,
      customerDetails: {
        first_name: user.nama_lengkap,
        email: user.email,
        phone: user.no_hp,
        billing_address: midtransAddress,
        shipping_address: midtransAddress,
      },
      finishRedirectUrl,
      items: [
        ...validatedItems.map((i) => ({
          id: i.variantId,
          price: i.price,
          quantity: i.quantity,
          name: i.namaProduk.slice(0, 50),
        })),
        { id: "shipping", price: shippingCost, quantity: 1, name: "Ongkos Kirim" },
      ],
    });
  } catch (error) {
    console.error("Midtrans Error:", error);
    throw new AppError(error.message || "Gagal menghubungi layanan pembayaran Midtrans", 500);
  }

  await paymentRepository.create({
    orderId: order.id,
    midtransOrderId,
    grossAmount: grandTotal,
    snapToken,
  });

  const fullOrder = await orderRepository.findById(order.id);
  const response = toResponse(fullOrder);
  
  // Pastikan snapToken selalu dikembalikan (berjaga-jaga jika relasi db tidak langsung memuatnya)
  if (!response.payment) {
    response.payment = { transactionStatus: "pending", paymentType: null, snapToken, paidAt: null };
  } else if (!response.payment.snapToken) {
    response.payment.snapToken = snapToken;
  }
  
  return response;
}

/**
 * UPDATE 1 - tombol "Bayar Sekarang" / "Lanjutkan Pembayaran" untuk pesanan yang masih
 * berstatus Menunggu Pembayaran (mis. popup Midtrans ditutup sebelum pembayaran selesai).
 * TIDAK PERNAH membuat order baru maupun baris payments baru: kolom payments.order_id
 * bersifat unique, jadi baris payments milik order yang sama selalu di-UPDATE di tempat
 * (paymentRepository.updateByOrderId), tidak pernah di-insert ulang.
 *
 * Alur:
 * 1. Pastikan order tersebut milik user & masih berstatus Menunggu Pembayaran.
 * 2. Cek status transaksi Midtrans yang tersimpan lewat Core API:
 *    - Masih "pending" di sisi Midtrans -> Snap Token lama dipakai ulang apa adanya,
 *      tidak membuat transaksi baru sama sekali.
 *    - Sudah expire/dibatalkan/tidak ditemukan/Core API gagal dihubungi -> dibuatkan
 *      Snap Transaction baru dengan midtrans_order_id baru (harus unik di sisi Midtrans,
 *      mencegah error "order_id has already been used"), lalu baris payments yang SAMA
 *      di-update dengan Snap Token barunya.
 * 3. Setelah user menyelesaikan pembayaran (di popup lama atau baru), Webhook Midtrans
 *    (paymentService.handleMidtransNotification) tetap satu-satunya sumber kebenaran
 *    yang mengubah status order menjadi Sudah Dibayar.
 */
async function continuePayment(userId, orderId) {
  const order = await orderRepository.findById(orderId);
  if (!order || order.user_id !== userId) {
    throw new AppError("Pesanan tidak ditemukan", 404);
  }
  if (order.status !== "menunggu_pembayaran") {
    throw new AppError("Pesanan ini sudah tidak dapat dilanjutkan pembayarannya", 400);
  }

  const existingPayment = await paymentRepository.findByOrderId(order.id);
  if (!existingPayment) {
    throw new AppError("Data pembayaran untuk pesanan ini tidak ditemukan", 404);
  }

  if (existingPayment.midtrans_order_id && existingPayment.snap_token) {
    const midtransStatus = await midtrans.getTransactionStatus(existingPayment.midtrans_order_id);
    if (midtransStatus?.transaction_status === "pending") {
      return { orderId: order.id, snapToken: existingPayment.snap_token };
    }
  }

  const address = await addressRepository.findById(order.address_id);
  const user = await userRepository.findById(order.user_id);
  if (!address || !user) {
    throw new AppError("Data alamat atau pengguna untuk pesanan ini tidak lengkap", 400);
  }

  const midtransOrderId = `NUTWEAR-${order.id.slice(0, 8)}-${uuidv4().slice(0, 6)}`;
  const finishRedirectUrl = `${env.frontendUrl}/profile/riwayat-pesanan?order=${order.id}`;
  const midtransAddress = {
    first_name: address.receiver_name,
    phone: address.phone,
    address: [address.address, address.district, address.province].filter(Boolean).join(", "),
    city: address.city,
    postal_code: address.postal_code,
    country_code: "IDN",
  };

  let snapToken;
  try {
    snapToken = await midtrans.createSnapTransaction({
      midtransOrderId,
      grossAmount: order.grand_total,
      customerDetails: {
        first_name: user.nama_lengkap,
        email: user.email,
        phone: user.no_hp,
        billing_address: midtransAddress,
        shipping_address: midtransAddress,
      },
      finishRedirectUrl,
      items: [
        ...(order.order_items || []).map((oi) => ({
          id: oi.variant_id,
          price: oi.price,
          quantity: oi.quantity,
          name: (oi.product_name ?? oi.product_variants?.products?.nama_produk ?? "Produk").slice(0, 50),
        })),
        { id: "shipping", price: order.shipping_cost, quantity: 1, name: "Ongkos Kirim" },
      ],
    });
  } catch (error) {
    console.error("Midtrans Error (continuePayment):", error);
    throw new AppError(error.message || "Gagal menghubungi layanan pembayaran Midtrans", 500);
  }

  await paymentRepository.updateByOrderId(order.id, {
    midtrans_order_id: midtransOrderId,
    snap_token: snapToken,
    transaction_status: "pending",
    transaction_id: null,
    fraud_status: null,
  });

  return { orderId: order.id, snapToken };
}

async function getOrdersByUser(userId) {
  const orders = await orderRepository.findAllByUser(userId);
  return orders.map(toResponse);
}

async function getAllOrders(filters = {}) {
  const orders = await orderRepository.findAll(filters);
  return orders.map(toResponse);
}

async function getOrderById(userId, orderId, isAdmin = false) {
  const order = await orderRepository.findById(orderId);
  if (!order) throw new AppError("Pesanan tidak ditemukan", 404);
  if (!isAdmin && order.user_id !== userId) throw new AppError("Pesanan tidak ditemukan", 404);
  return toResponse(order);
}

async function updateOrderStatus(orderId, status) {
  const updated = await orderRepository.updateStatus(orderId, status);
  if (!updated) throw new AppError("Pesanan tidak ditemukan", 404);

  // UPDATE 8 — updateStatus() di atas hanya mengembalikan kolom `orders` (tanpa
  // order_items), padahal clearCartForPaidOrder & toResponse butuh order_items
  // lengkap (variant_id, harga, dst). Ambil ulang order lengkap sekali di sini.
  const order = (await orderRepository.findById(orderId)) ?? updated;

  // UPDATE 8 — kalau admin menandai pesanan Sudah Dibayar secara manual (di luar
  // Webhook Midtrans, mis. pembayaran manual/transfer), item keranjang yang cocok
  // ikut dibuang juga, sama seperti alur Webhook (lihat clearCartForPaidOrder).
  if (status === "sudah_dibayar") {
    await clearCartForPaidOrder(order).catch(() => {});
  }

  const response = toResponse(order);
  // Update 1 — Notifikasi Status Pesanan: dikirim hanya ke pemilik pesanan, jangan
  // sampai kegagalan notifikasi menggagalkan update status pesanan itu sendiri.
  notificationService.notifyOrderStatus(response).catch(() => {});
  return response;
}

/**
 * Membatalkan pesanan atas inisiatif user sendiri dari Riwayat Pesanan
 * (Update 2, poin 1-3 & 7). Hanya boleh dilakukan oleh pemilik pesanan,
 * dan hanya selagi status masih "menunggu_pembayaran" — pesanan yang sudah
 * dibayar/diproses/dikirim/selesai/dibatalkan/expired tidak boleh dibatalkan
 * lewat aksi ini (poin 7).
 */
async function cancelOrderByUser(userId, orderId) {
  const order = await orderRepository.findById(orderId);
  if (!order || order.user_id !== userId) {
    throw new AppError("Pesanan tidak ditemukan", 404);
  }
  if (order.status !== "menunggu_pembayaran") {
    throw new AppError("Pesanan hanya dapat dibatalkan selagi berstatus Menunggu Pembayaran", 400);
  }

  const updated = await orderRepository.cancelByUser(orderId);
  if (!updated) {
    throw new AppError("Pesanan sudah diproses dan tidak dapat dibatalkan lagi", 400);
  }

  // Kembalikan stok tiap varian yang sebelumnya sudah dikurangi saat checkout
  // (poin 3 — mengikuti alur stok yang sama dengan stockRepository.decreaseStock
  // di orderService.checkout, hanya dibalik arahnya).
  for (const item of order.order_items || []) {
    if (item.variant_id) {
      await stockRepository.increaseStock(item.variant_id, item.quantity);
    }
  }

  const response = toResponse({
    ...order,
    status: updated.status,
    cancelled_by: updated.cancelled_by,
    updated_at: updated.updated_at,
  });

  // Notifikasi ke user bahwa pesanan berhasil dibatalkan (poin 3). Kegagalan
  // notifikasi tidak boleh menggagalkan proses pembatalan itu sendiri.
  notificationService.notifyOrderStatus(response).catch(() => {});

  return response;
}

/** Menghapus satu pesanan (Update 3, poin 5). order_items & payments ikut terhapus. */
async function deleteOrder(orderId) {
  const order = await orderRepository.findById(orderId);
  if (!order) throw new AppError("Pesanan tidak ditemukan", 404);
  await orderRepository.deleteOrder(orderId);
  return true;
}

/**
 * Menghapus seluruh pesanan yang sedang ditampilkan berdasarkan filter aktif
 * (tanggal/bulan+tahun/status) di halaman Admin — tombol "Hapus Semua" (Update 3, poin 6-7).
 *
 * Untuk menghindari penghapusan pesanan yang masih aktif, hanya pesanan dengan status
 * Selesai, Dibatalkan, atau Expired yang boleh terhapus:
 *  - Jika admin memfilter status yang belum diperbolehkan (mis. "Diproses"), tolak dengan
 *    pesan yang jelas tanpa menghapus apa pun.
 *  - Jika tidak ada filter status (Semua Status) atau statusnya sudah termasuk yang
 *    diperbolehkan, hanya baris dengan status yang diperbolehkan pada filter tanggal/bulan
 *    tersebut yang dihapus — pesanan aktif pada rentang yang sama tetap aman.
 */
async function deleteOrdersByFilter({ date, month, year, status }) {
  const allowedStatuses = orderRepository.BULK_DELETE_ALLOWED_STATUSES;

  if (status && !allowedStatuses.includes(status)) {
    throw new AppError(
      "Pesanan dengan status ini masih aktif dan tidak dapat dihapus. Hapus Semua hanya berlaku untuk pesanan Selesai, Dibatalkan, atau Expired.",
      400
    );
  }

  const deletedCount = await orderRepository.deleteManyByFilter({ date, month, year, status, allowedStatuses });
  return deletedCount;
}

/**
 * UPDATE 8 — Menghapus item keranjang yang sesuai dengan sebuah pesanan yang BARU SAJA
 * lunas dibayar (dipanggil dari Webhook Midtrans setelah status order menjadi
 * "sudah_dibayar", dan dari updateOrderStatus kalau admin menandai pesanan Sudah Dibayar
 * secara manual). Dicocokkan lewat variant_id tiap order_items terhadap keranjang milik
 * user yang sama — item keranjang lain (varian/produk berbeda) tidak ikut terhapus.
 */
async function clearCartForPaidOrder(order) {
  const variantIds = (order.order_items || [])
    .map((item) => item.variant_id)
    .filter((id) => Boolean(id));
  if (variantIds.length === 0) return;
  await cartRepository.deleteByVariantIds(order.user_id, variantIds);
}

module.exports = {
  checkout,
  continuePayment,
  getOrdersByUser,
  getAllOrders,
  getOrderById,
  updateOrderStatus,
  cancelOrderByUser,
  deleteOrder,
  deleteOrdersByFilter,
  toResponse,
  clearCartForPaidOrder,
};
