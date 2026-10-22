-- 0002_seed_rooms.sql
-- Kerangka 21 kamar sesuai brief. Harga sewa sengaja 0 (diisi manual oleh pemilik).
-- Tidak ada data penyewa atau transaksi yang dibuat di sini.
insert into rooms (number, floor, monthly_rent)
select lpad(n::text, 2, '0'), case when n <= 15 then 1 else 2 end, 0
from generate_series(1, 21) as n
on conflict (number) do nothing;
