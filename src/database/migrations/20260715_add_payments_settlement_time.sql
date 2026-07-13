-- Menambahkan kolom settlement_time pada tabel payments.
-- Diisi dari field `settlement_time` pada payload Notification/Webhook Midtrans
-- (tersedia untuk transaction_status "settlement"/"capture"), terpisah dari `paid_at`
-- (waktu internal sistem NutWear pertama kali menandai order sebagai "sudah_dibayar")
-- supaya waktu asli dari Midtrans tetap tersimpan apa adanya untuk keperluan audit/rekonsiliasi.
alter table payments
  add column if not exists settlement_time timestamp;
