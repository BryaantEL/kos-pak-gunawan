-- 0001_init.sql
-- Skema awal Kos Pak Gunawan. Jalankan sekali di Supabase SQL Editor.
--
-- Prinsip:
-- 1. Transaksi keuangan tidak pernah dihapus. Pembatalan memakai void_reason dan audit_log.
-- 2. Saldo, status, dan sisa tagihan DIHITUNG lewat view, tidak disimpan sebagai kolom.
-- 3. Tagihan diterbitkan lewat fungsi issue_bill; baris tagihan tidak diubah setelah terbit.
-- 4. Pembayaran dicatat lewat fungsi record_payment dalam satu transaksi database.
-- 5. RLS aktif di semua tabel tanpa policy publik. Hanya service role (server) yang bisa mengakses.
--    Saat Supabase Auth ditambahkan, policy untuk pemilik ditambahkan di sini.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- pengaturan
create table app_settings (
  id smallint primary key default 1 check (id = 1),
  kos_name text not null default 'Kos Pak Gunawan',
  address text,
  owner_whatsapp text check (owner_whatsapp is null or owner_whatsapp ~ '^62[0-9]{8,13}$'),
  map_lat numeric(9,6),
  map_lng numeric(9,6),
  updated_at timestamptz not null default now()
);
insert into app_settings (id) values (1) on conflict do nothing;

-- ---------------------------------------------------------------- kamar
create table rooms (
  id uuid primary key default gen_random_uuid(),
  number text not null unique check (number ~ '^[0-9]{2}$'),
  floor smallint not null check (floor in (1, 2)),
  monthly_rent integer not null default 0 check (monthly_rent >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Lantai 1: kamar 01-15. Lantai 2: kamar 16-21 (sesuai brief).
  check (
    (floor = 1 and number::int between 1 and 15)
    or (floor = 2 and number::int between 16 and 21)
  )
);

create table electronic_items (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete restrict,
  name text not null check (length(trim(name)) > 0),
  monthly_fee integer not null default 0 check (monthly_fee >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- penyewa
create table tenants (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (length(trim(full_name)) > 0),
  whatsapp text check (whatsapp is null or whatsapp ~ '^62[0-9]{8,13}$'),
  electronics_note text,
  owner_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Satu periode sewa per masuk-keluar. Riwayat tidak dihapus.
create table tenancies (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete restrict,
  move_in_date date not null,
  end_date date,
  deposit_amount integer not null default 0 check (deposit_amount >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date is null or end_date >= move_in_date)
);

-- Satu kamar hanya boleh punya satu sewa aktif.
create unique index tenancies_one_active_per_room on tenancies (room_id) where end_date is null;

create table tenancy_occupants (
  id uuid primary key default gen_random_uuid(),
  tenancy_id uuid not null references tenancies(id) on delete restrict,
  tenant_id uuid not null references tenants(id) on delete restrict,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  unique (tenancy_id, tenant_id)
);

-- Tepat satu kontak utama per sewa.
create unique index one_primary_per_tenancy on tenancy_occupants (tenancy_id) where is_primary;

-- Maksimal dua penghuni per kamar.
create or replace function enforce_max_occupants() returns trigger
language plpgsql as $$
begin
  if (select count(*) from tenancy_occupants where tenancy_id = new.tenancy_id) > 2 then
    raise exception 'Maksimal 2 penghuni per kamar';
  end if;
  return new;
end $$;

create trigger trg_max_occupants
after insert on tenancy_occupants
for each row execute function enforce_max_occupants();

-- ---------------------------------------------------------------- tagihan
-- Header tagihan. Total dihitung dari bill_lines.
create table bills (
  id uuid primary key default gen_random_uuid(),
  bill_number text not null unique,
  tenancy_id uuid not null references tenancies(id) on delete restrict,
  period_start date not null,
  period_end date not null,
  due_date date not null,
  issued_at timestamptz not null default now(),
  unique (tenancy_id, period_start),
  check (period_end >= period_start)
);

-- Baris tagihan: snapshot harga saat tagihan diterbitkan. Append-only.
create table bill_lines (
  id uuid primary key default gen_random_uuid(),
  bill_id uuid not null references bills(id) on delete restrict,
  kind text not null check (kind in ('sewa', 'elektronik', 'prorata', 'penyesuaian')),
  description text not null,
  amount integer not null,
  electronic_item_id uuid references electronic_items(id) on delete set null,
  reason text,
  created_at timestamptz not null default now(),
  check (kind <> 'penyesuaian' or (reason is not null and length(trim(reason)) > 0))
);

-- ---------------------------------------------------------------- pembayaran
create table payments (
  id uuid primary key default gen_random_uuid(),
  tenancy_id uuid not null references tenancies(id) on delete restrict,
  amount integer not null check (amount > 0),
  method text not null check (method in ('tunai', 'transfer')),
  paid_on date not null,
  reference text,
  purpose text not null default 'tagihan' check (purpose in ('tagihan', 'deposit')),
  voided_at timestamptz,
  void_reason text,
  created_at timestamptz not null default now(),
  check ((voided_at is null) = (void_reason is null))
);

create table payment_allocations (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references payments(id) on delete restrict,
  bill_id uuid not null references bills(id) on delete restrict,
  amount integer not null check (amount > 0),
  created_at timestamptz not null default now(),
  unique (payment_id, bill_id)
);

-- ---------------------------------------------------------------- pengeluaran
create table expense_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(trim(name)) > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table expenses (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references expense_categories(id) on delete restrict,
  amount integer not null check (amount > 0),
  expense_date date not null,
  description text,
  method text check (method is null or method in ('tunai', 'transfer')),
  proof_url text,
  voided_at timestamptz,
  void_reason text,
  created_at timestamptz not null default now(),
  check ((voided_at is null) = (void_reason is null))
);

-- ---------------------------------------------------------------- audit
create table audit_log (
  id uuid primary key default gen_random_uuid(),
  table_name text not null,
  record_id uuid,
  action text not null,
  before_data jsonb,
  after_data jsonb,
  reason text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- view turunan
-- Total, dibayar, dan sisa tagihan. Pembayaran yang dibatalkan tidak dihitung.
create or replace view bill_summary as
select
  b.id as bill_id,
  b.bill_number,
  b.tenancy_id,
  b.period_start,
  b.period_end,
  b.due_date,
  coalesce(l.total, 0)::integer as total,
  coalesce(p.paid, 0)::integer as paid,
  greatest(coalesce(l.total, 0) - coalesce(p.paid, 0), 0)::integer as remaining
from bills b
left join (
  select bill_id, sum(amount) as total from bill_lines group by bill_id
) l on l.bill_id = b.id
left join (
  select a.bill_id, sum(a.amount) as paid
  from payment_allocations a
  join payments py on py.id = a.payment_id
  where py.voided_at is null
  group by a.bill_id
) p on p.bill_id = b.id;

-- ---------------------------------------------------------------- fungsi transaksi

-- Menerbitkan satu tagihan beserta barisnya dalam satu transaksi.
create or replace function issue_bill(
  p_tenancy_id uuid,
  p_period_start date,
  p_period_end date,
  p_due_date date,
  p_lines jsonb
) returns uuid
language plpgsql as $$
declare
  v_bill_id uuid;
  l jsonb;
begin
  if p_period_end < p_period_start then
    raise exception 'Periode tagihan tidak valid';
  end if;
  if jsonb_array_length(p_lines) = 0 then
    raise exception 'Tagihan harus memiliki minimal satu baris';
  end if;

  insert into bills (bill_number, tenancy_id, period_start, period_end, due_date)
  values (
    'KPG-' || to_char(p_period_start, 'YYYYMM') || '-' || upper(substr(gen_random_uuid()::text, 1, 6)),
    p_tenancy_id, p_period_start, p_period_end, p_due_date
  )
  returning id into v_bill_id;

  for l in select * from jsonb_array_elements(p_lines) loop
    insert into bill_lines (bill_id, kind, description, amount, electronic_item_id, reason)
    values (
      v_bill_id,
      l->>'kind',
      l->>'description',
      (l->>'amount')::integer,
      nullif(l->>'electronic_item_id', '')::uuid,
      nullif(l->>'reason', '')
    );
  end loop;

  return v_bill_id;
end $$;

-- Mencatat pembayaran dan mengalokasikannya FIFO ke tagihan terbuka.
-- Baris tagihan dikunci dulu agar dua pencatatan bersamaan tidak saling menimpa.
create or replace function record_payment(
  p_tenancy_id uuid,
  p_amount integer,
  p_method text,
  p_paid_on date,
  p_reference text default null,
  p_purpose text default 'tagihan'
) returns table (out_payment_id uuid, out_allocated integer, out_unallocated integer)
language plpgsql as $$
declare
  v_payment_id uuid;
  v_left integer := p_amount;
  v_take integer;
  r record;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'Nominal harus lebih dari 0';
  end if;
  if p_method not in ('tunai', 'transfer') then
    raise exception 'Metode pembayaran tidak valid';
  end if;
  if p_purpose not in ('tagihan', 'deposit') then
    raise exception 'Tujuan pembayaran tidak valid';
  end if;
  if not exists (select 1 from tenancies where id = p_tenancy_id) then
    raise exception 'Sewa tidak ditemukan';
  end if;

  perform 1 from bills where tenancy_id = p_tenancy_id for update;

  insert into payments (tenancy_id, amount, method, paid_on, reference, purpose)
  values (p_tenancy_id, p_amount, p_method, p_paid_on, p_reference, p_purpose)
  returning id into v_payment_id;

  if p_purpose = 'tagihan' then
    for r in
      select bill_id, remaining
      from bill_summary
      where tenancy_id = p_tenancy_id and remaining > 0
      order by due_date, bill_id
    loop
      exit when v_left = 0;
      v_take := least(v_left, r.remaining);
      insert into payment_allocations (payment_id, bill_id, amount)
      values (v_payment_id, r.bill_id, v_take);
      v_left := v_left - v_take;
    end loop;
  end if;

  return query select v_payment_id, p_amount - v_left, v_left;
end $$;

-- Pembatalan pembayaran: tidak menghapus data, hanya menandai dengan alasan.
create or replace function void_payment(p_payment_id uuid, p_reason text)
returns void
language plpgsql as $$
begin
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'Alasan pembatalan wajib diisi';
  end if;
  update payments
  set voided_at = now(), void_reason = p_reason
  where id = p_payment_id and voided_at is null;
  if not found then
    raise exception 'Pembayaran tidak ditemukan atau sudah dibatalkan';
  end if;
  insert into audit_log (table_name, record_id, action, reason)
  values ('payments', p_payment_id, 'void', p_reason);
end $$;

-- ---------------------------------------------------------------- RLS
alter table app_settings enable row level security;
alter table rooms enable row level security;
alter table electronic_items enable row level security;
alter table tenants enable row level security;
alter table tenancies enable row level security;
alter table tenancy_occupants enable row level security;
alter table bills enable row level security;
alter table bill_lines enable row level security;
alter table payments enable row level security;
alter table payment_allocations enable row level security;
alter table expense_categories enable row level security;
alter table expenses enable row level security;
alter table audit_log enable row level security;
