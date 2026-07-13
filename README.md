# NutWear Backend (Express.js)

## Setup

1. `npm install`
2. Copy `.env.example` ke `.env`, isi kredensial Supabase & JWT secret.
3. Jalankan `src/database/schema.sql` di Supabase SQL Editor untuk membuat seluruh tabel.
4. `npm run dev` (butuh `nodemon` — sudah termasuk di devDependencies).

Server berjalan di `http://localhost:4000`, semua endpoint di-prefix `/api/v1`.

## Modul yang sudah tersedia (Fase 2 — SELESAI)

| Modul | Endpoint utama |
|---|---|
| Authentication | `POST /auth/register`, `/login`, `/refresh`, `/logout`, `GET /auth/me` |
| User Profile | `GET/PUT /users/me/profile` |
| Address | `GET/POST /users/me/addresses`, `PUT/DELETE /users/me/addresses/:id`, `PATCH .../default` |
| Category | `GET /categories`, admin CRUD |
| Product | `GET /products`, `/products/slug/:slug`, admin CRUD + varian + upload gambar |
| Banner | `GET /banners`, admin CRUD + upload gambar |
| Wishlist | `GET/POST /wishlist`, `DELETE /wishlist/:productId` |
| Cart | `GET/POST /cart`, `PUT/DELETE /cart/:id` |
| Order & Checkout | `POST /orders/checkout` (validasi stok/harga/varian + Snap Token Midtrans), `GET /orders/my` |
| Payment Webhook | `POST /payments/midtrans/webhook` (verifikasi signature key) |
| Review | `GET /reviews/product/:id`, `POST /reviews`, admin moderasi |
| Stock | `PATCH /stock/:variantId/adjust`, `GET /stock/:variantId/logs` |
| Admin Dashboard | `GET /admin/dashboard/summary` (stats, grafik penjualan, produk terlaris) |

Semua endpoint di atas berjalan lewat prefix `/api/v1`, mis. `http://localhost:4000/api/v1/products`.

## Arsitektur

Route → Validator → Controller → Service → Repository → Supabase.
Setiap layer punya tanggung jawab tunggal (Clean Architecture), lihat komentar di masing-masing file.

## Catatan integrasi

- **Midtrans**: isi `MIDTRANS_SERVER_KEY`/`MIDTRANS_CLIENT_KEY` di `.env`. Endpoint webhook wajib didaftarkan di dashboard Midtrans mengarah ke `https://<domain-backend>/api/v1/payments/midtrans/webhook`.
- **Supabase Storage**: buat bucket bernama `nutwear-assets` (public) sebelum upload gambar produk/banner berfungsi.
- Stok otomatis berkurang saat checkout dan otomatis dikembalikan bila pembayaran batal/expired (lihat `orderService.js` & `paymentService.js`).
