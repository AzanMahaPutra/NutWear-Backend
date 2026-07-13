/**
 * UPDATE 3 — Sumber kebenaran tunggal untuk status & harga promo produk di backend.
 *
 * Dipakai oleh productService (Card Produk, Detail Produk, Pasangan Produk), cartService
 * (Keranjang), dan orderService (Checkout) supaya validasi "promo masih aktif?" dan
 * "harga mana yang dipakai?" selalu konsisten di seluruh alur — tidak ada lagi
 * perhitungan harga promo yang berbeda-beda/duplikat di tiap service.
 *
 * Menerima row produk mentah dari database (snake_case: harga, harga_promo,
 * promo_mulai, promo_selesai) supaya bisa dipakai langsung oleh repository/service
 * mana pun tanpa perlu mapping ke response shape terlebih dahulu.
 */

/** Promo dianggap aktif kalau harga_promo terisi DAN tanggal sekarang ada di antara promo_mulai & promo_selesai (kalau diisi). */
function isPromoActive(product) {
  if (!product || product.harga_promo == null) return false;

  const today = new Date().toISOString().slice(0, 10);
  if (product.promo_mulai && product.promo_mulai > today) return false;
  if (product.promo_selesai && product.promo_selesai < today) return false;

  return true;
}

/** Harga yang benar-benar dipakai untuk perhitungan (Subtotal, Total Cart, Checkout, Order): promo kalau aktif, normal kalau tidak. */
function getEffectivePrice(product) {
  return isPromoActive(product) ? product.harga_promo : product.harga;
}

module.exports = { isPromoActive, getEffectivePrice };
