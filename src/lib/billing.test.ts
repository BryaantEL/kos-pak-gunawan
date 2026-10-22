import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addDays,
  addMonthsClamped,
  allocatePayment,
  billStatus,
  billingPeriod,
  buildRegularBillLines,
  daysInMonth,
  daysInclusive,
  periodsToIssue,
  prorateRent,
  sumLines,
} from './billing.ts';

test('jumlah hari dalam bulan termasuk tahun kabisat', () => {
  assert.equal(daysInMonth(2026, 10), 31);
  assert.equal(daysInMonth(2026, 2), 28);
  assert.equal(daysInMonth(2028, 2), 29);
});

test('tanggal 31 jatuh tempo di bulan pendek lalu kembali ke 31', () => {
  assert.equal(addMonthsClamped('2026-01-31', 1), '2026-02-28');
  assert.equal(addMonthsClamped('2026-01-31', 2), '2026-03-31');
  assert.equal(addMonthsClamped('2028-01-31', 1), '2028-02-29');
  assert.equal(addMonthsClamped('2026-01-29', 1), '2026-02-28');
});

test('periode mengikuti tanggal masuk dan tidak tumpang tindih', () => {
  const p0 = billingPeriod('2026-10-20', 0);
  assert.deepEqual(p0, { index: 0, start: '2026-10-20', end: '2026-11-19', dueDate: '2026-10-20' });
  const p1 = billingPeriod('2026-10-20', 1);
  assert.deepEqual(p1, { index: 1, start: '2026-11-20', end: '2026-12-19', dueDate: '2026-11-20' });
  assert.equal(addDays(p0.end, 1), p1.start);

  const p = billingPeriod('2026-01-31', 1);
  assert.equal(p.start, '2026-02-28');
  assert.equal(p.end, '2026-03-30');
});

test('prorata dihitung inklusif dan dibulatkan ke rupiah', () => {
  assert.equal(daysInclusive('2026-10-20', '2026-10-31'), 12);
  assert.equal(prorateRent(700_000, '2026-10-20', '2026-10-31'), 270_968);
  assert.equal(prorateRent(700_000, '2026-10-01', '2026-10-31'), 700_000);
  assert.throws(() => prorateRent(700_000, '2026-10-20', '2026-11-02'));
});

test('tagihan awal menjumlahkan sewa dan biaya elektronik (contoh brief)', () => {
  const lines = buildRegularBillLines(700_000, [
    { id: 'e1', name: 'Kipas angin', monthlyFee: 50_000 },
    { id: 'e2', name: 'Barang tanpa biaya', monthlyFee: 0 },
  ]);
  assert.equal(lines.length, 2);
  assert.equal(sumLines(lines), 750_000);
});

test('periode yang sudah terbit tidak diterbitkan ulang', () => {
  const none = periodsToIssue('2026-10-20', [], '2026-10-22');
  assert.deepEqual(none.map((p) => p.start), ['2026-10-20']);

  const next = periodsToIssue('2026-10-20', ['2026-10-20'], '2026-11-20');
  assert.deepEqual(next.map((p) => p.start), ['2026-11-20']);

  const none2 = periodsToIssue('2026-10-20', ['2026-10-20', '2026-11-20'], '2026-11-25');
  assert.deepEqual(none2, []);
});

test('lead days menerbitkan tagihan lebih awal', () => {
  const early = periodsToIssue('2026-10-20', ['2026-10-20'], '2026-11-13', 7);
  assert.deepEqual(early.map((p) => p.start), ['2026-11-20']);
  const notYet = periodsToIssue('2026-10-20', ['2026-10-20'], '2026-11-12', 7);
  assert.deepEqual(notYet, []);
});

test('status tagihan: terlambat tanpa denda, jatuh tempo hari ini, lunas', () => {
  const late = billStatus({ total: 700_000, paid: 0, dueDate: '2026-10-20', today: '2026-10-22' });
  assert.deepEqual(late, { status: 'terlambat', remaining: 700_000, isPartial: false });

  const today = billStatus({ total: 700_000, paid: 0, dueDate: '2026-10-22', today: '2026-10-22' });
  assert.equal(today.status, 'jatuh_tempo_hari_ini');

  const future = billStatus({ total: 700_000, paid: 0, dueDate: '2026-11-20', today: '2026-10-22' });
  assert.equal(future.status, 'belum_jatuh_tempo');

  const paid = billStatus({ total: 700_000, paid: 700_000, dueDate: '2026-10-20', today: '2026-10-22' });
  assert.deepEqual(paid, { status: 'lunas', remaining: 0, isPartial: false });
});

test('pembayaran sebagian menyisakan sisa tagihan yang benar', () => {
  const partial = billStatus({ total: 750_000, paid: 300_000, dueDate: '2026-11-20', today: '2026-11-21' });
  assert.equal(partial.status, 'terlambat');
  assert.equal(partial.remaining, 450_000);
  assert.equal(partial.isPartial, true);
});

test('alokasi pembayaran FIFO dan kelebihan bayar dikembalikan terpisah', () => {
  const bills = [
    { id: 'B', dueDate: '2026-11-20', remaining: 750_000 },
    { id: 'A', dueDate: '2026-10-20', remaining: 700_000 },
  ];
  const exact = allocatePayment(800_000, bills);
  assert.deepEqual(exact.allocations, [
    { billId: 'A', amount: 700_000 },
    { billId: 'B', amount: 100_000 },
  ]);
  assert.equal(exact.unallocated, 0);

  const over = allocatePayment(2_000_000, bills);
  assert.equal(over.unallocated, 550_000);

  const partial = allocatePayment(300_000, bills);
  assert.deepEqual(partial.allocations, [{ billId: 'A', amount: 300_000 }]);
});

test('nominal pembayaran tidak valid ditolak', () => {
  assert.throws(() => allocatePayment(0, []));
  assert.throws(() => allocatePayment(10.5, []));
});

test('tanggal tidak valid ditolak', () => {
  assert.throws(() => addDays('2026-02-30', 1));
  assert.throws(() => billingPeriod('20-10-2026', 0));
});
