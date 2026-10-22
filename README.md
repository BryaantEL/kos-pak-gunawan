# Kos Pak Gunawan

Dashboard pribadi pengelolaan kos. Stack: Next.js (App Router), TypeScript, Tailwind CSS, Supabase PostgreSQL.

## Status Implementasi

| Area | Status |
|---|---|
| Logika tagihan (periode, prorata, status, alokasi pembayaran) | Selesai, 12 uji lulus |
| Skema database dan fungsi transaksi (`issue_bill`, `record_payment`, `void_payment`) | Ditulis, **belum diuji pada Supabase sungguhan** |
| Layout, tema terang/gelap otomatis | Dasar selesai, **tombol pergantian tema belum ada** |
| Dashboard (statistik dari database) | Dasar selesai, **belum diuji di browser** |
| Data Kamar (daftar per lantai) | Dasar selesai, belum bisa menambah atau mengubah kamar |
| Penyewa, check-in, akhiri sewa | Belum dibuat |
| Terbitkan tagihan, konfirmasi pembayaran | Belum dibuat (logika dasarnya sudah ada) |
| Pengeluaran, laporan keuangan, grafik | Belum dibuat |
| Peta lokasi (Leaflet + OpenStreetMap) | Belum dibuat |
| Tautan WhatsApp manual | Belum dibuat |
| Ekspor CSV | Belum dibuat |
| Supabase Auth dan RLS untuk pemilik | Tahap berikutnya (sesuai rencana) |

## Menjalankan Secara Lokal

1. Pasang dependensi: `npm install`
2. Buat proyek di Supabase, lalu jalankan berurutan di SQL Editor:
   - `supabase/migrations/0001_init.sql`
   - `supabase/migrations/0002_seed_rooms.sql`
3. Salin `.env.example` menjadi `.env.local`, isi `SUPABASE_URL` dan `SUPABASE_SERVICE_ROLE_KEY` dari Project Settings > API.
4. Uji logika tagihan: `npm test`
5. Jalankan aplikasi: `npm run dev`, lalu buka http://localhost:3000

## Catatan Keamanan

- Service role key hanya dipakai di server. Jangan beri prefix `NEXT_PUBLIC_` dan jangan commit `.env.local`.
- Semua tabel memakai RLS tanpa policy publik. Sebelum Supabase Auth aktif, jangan pasang aplikasi ini di hosting publik dengan data penyewa asli.

## Asumsi yang Perlu Dikonfirmasi

- Siklus tagihan mengikuti tanggal masuk. Pembayaran pertama dibayar di muka sebulan penuh saat penyewa masuk.
- Prorata hanya dipakai untuk potongan dalam satu bulan kalender. Dibulatkan ke rupiah terdekat.
- Kamar 01 sampai 21 dibuat otomatis dengan harga 0. Harga diisi pemilik.
- Pembayaran yang dibatalkan ditandai dengan alasan, tidak dihapus.
