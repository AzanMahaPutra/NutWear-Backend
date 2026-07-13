/**
 * Kalkulasi ongkir sisi backend (otoritatif — tidak boleh percaya nilai dari frontend).
 * Saat ini flat-rate berbasis berat total. Pada pengembangan berikutnya
 * (lihat dokumen "Scalable Architecture" — RajaOngkir/Ekspedisi), fungsi ini
 * tinggal diganti isinya untuk memanggil API ekspedisi tanpa mengubah pemanggil
 * (orderService) sama sekali.
 */
function calculateShippingCost(totalWeightGram) {
  if (totalWeightGram <= 0) return 0;
  const base = 15000;
  const perExtraKg = Math.max(0, Math.ceil((totalWeightGram - 1000) / 1000));
  return base + perExtraKg * 5000;
}

module.exports = { calculateShippingCost };
