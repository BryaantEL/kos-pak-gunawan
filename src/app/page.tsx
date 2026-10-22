import { StatCard } from '@/components/StatCard';
import { billStatus } from '@/lib/billing';
import { formatRupiah } from '@/lib/money';
import { getServerSupabase, unwrap } from '@/lib/supabase/server';
import { monthRange, todayJakarta } from '@/lib/time';

// Data selalu dibaca ulang dari database, tidak di-cache.
export const dynamic = 'force-dynamic';

interface SummaryRow {
  bill_id: string;
  due_date: string;
  total: number;
  paid: number;
  remaining: number;
}

export default async function DashboardPage() {
  const today = todayJakarta();
  const { start, end } = monthRange(today);
  const db = getServerSupabase();

  const [roomsRes, tenanciesRes, summaryRes, paymentsRes, expensesRes] = await Promise.all([
    db.from('rooms').select('id'),
    db.from('tenancies').select('id, room_id, tenancy_occupants(id)').is('end_date', null),
    db.from('bill_summary').select('bill_id, due_date, total, paid, remaining').gt('remaining', 0),
    db
      .from('payments')
      .select('amount, purpose')
      .is('voided_at', null)
      .gte('paid_on', start)
      .lte('paid_on', end),
    db.from('expenses').select('amount').is('voided_at', null).gte('expense_date', start).lte('expense_date', end),
  ]);

  const rooms = unwrap<{ id: string }>(roomsRes);
  const tenancies = unwrap<{ id: string; room_id: string; tenancy_occupants: { id: string }[] }>(tenanciesRes);
  const openBills = unwrap<SummaryRow>(summaryRes);
  const payments = unwrap<{ amount: number; purpose: string }>(paymentsRes);
  const expenses = unwrap<{ amount: number }>(expensesRes);

  const totalRooms = rooms.length;
  const occupiedRooms = new Set(tenancies.map((t) => t.room_id)).size;
  const emptyRooms = Math.max(0, totalRooms - occupiedRooms);
  const residents = tenancies.reduce((sum, t) => sum + t.tenancy_occupants.length, 0);

  const statuses = openBills.map((b) => ({
    ...b,
    ...billStatus({ total: b.total, paid: b.paid, dueDate: b.due_date, today }),
  }));
  const dueToday = statuses.filter((b) => b.status === 'jatuh_tempo_hari_ini');
  const overdue = statuses.filter((b) => b.status === 'terlambat');
  const arrears = overdue.reduce((sum, b) => sum + b.remaining, 0);

  // Uang sewa yang diterima bulan ini (deposit tidak dihitung sebagai omzet).
  const rentReceived = payments
    .filter((p) => p.purpose === 'tagihan')
    .reduce((sum, p) => sum + p.amount, 0);
  const depositReceived = payments
    .filter((p) => p.purpose === 'deposit')
    .reduce((sum, p) => sum + p.amount, 0);
  const expensesTotal = expenses.reduce((sum, e) => sum + e.amount, 0);
  const netCash = rentReceived - expensesTotal;

  const isEmpty = totalRooms === 0;

  return (
    <>
      <h1 className="page-title">Dashboard</h1>
      <p className="muted small">Hari ini: {today}</p>

      {isEmpty ? (
        <section className="card empty section">
          <p>Belum ada data kamar. Jalankan migrasi <code>0002_seed_rooms.sql</code> di Supabase.</p>
        </section>
      ) : null}

      <section className="section">
        <h2 className="section-title">Ringkasan</h2>
        <div className="grid-stats">
          <StatCard label="Total kamar" value={String(totalRooms)} />
          <StatCard label="Kamar terisi" value={String(occupiedRooms)} />
          <StatCard label="Kamar kosong" value={String(emptyRooms)} tone="ok" />
          <StatCard label="Total penghuni" value={String(residents)} />
          <StatCard
            label="Jatuh tempo hari ini"
            value={String(dueToday.length)}
            hint={dueToday.length ? formatRupiah(dueToday.reduce((s, b) => s + b.remaining, 0)) : 'Tidak ada'}
          />
          <StatCard
            label="Tagihan terlambat"
            value={String(overdue.length)}
            tone={overdue.length ? 'warn' : 'default'}
            hint={overdue.length ? `${formatRupiah(arrears)} tunggakan` : 'Tidak ada tunggakan'}
          />
          <StatCard label="Sewa diterima bulan ini" value={formatRupiah(rentReceived)} tone="ok" />
          <StatCard label="Pengeluaran bulan ini" value={formatRupiah(expensesTotal)} />
        </div>
        <p className="muted small" style={{ marginTop: 12 }}>
          Omzet bersih bulan ini (basis kas): {formatRupiah(netCash)}.
          {depositReceived > 0 ? ` Deposit ${formatRupiah(depositReceived)} tidak termasuk omzet.` : ''}
        </p>
      </section>
    </>
  );
}
