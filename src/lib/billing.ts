// Logika tagihan murni (tanpa database, tanpa framework).
// Semua tanggal berformat YYYY-MM-DD dan dihitung dalam UTC agar tidak bergeser zona waktu.

export type ISODate = string;

export type BillStatus = 'belum_jatuh_tempo' | 'jatuh_tempo_hari_ini' | 'terlambat' | 'lunas';

export type BillLineKind = 'sewa' | 'elektronik' | 'prorata' | 'penyesuaian';

export interface BillingPeriod {
  index: number;
  start: ISODate;
  end: ISODate;
  dueDate: ISODate;
}

export interface BillLine {
  kind: BillLineKind;
  description: string;
  amount: number;
  electronicItemId?: string;
  reason?: string;
}

export interface OpenBill {
  id: string;
  dueDate: ISODate;
  remaining: number;
}

export interface Allocation {
  billId: string;
  amount: number;
}

const DAY_MS = 86_400_000;

function toParts(iso: ISODate): { y: number; m: number; d: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) throw new Error(`Format tanggal tidak valid: ${iso}`);
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const check = new Date(Date.UTC(y, m - 1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) {
    throw new Error(`Tanggal tidak ada di kalender: ${iso}`);
  }
  return { y, m, d };
}

function fromParts(y: number, m: number, d: number): ISODate {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Jumlah hari dalam bulan. `m` berbasis 1 (Januari = 1). */
export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function addDays(iso: ISODate, days: number): ISODate {
  const { y, m, d } = toParts(iso);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return fromParts(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

/**
 * Menambah bulan terhadap tanggal acuan asli, bukan terhadap hasil bulan sebelumnya.
 * Contoh: acuan 31 Jan -> 28/29 Feb -> 31 Mar (bukan 28 Mar).
 */
export function addMonthsClamped(anchor: ISODate, months: number): ISODate {
  const { y, m, d } = toParts(anchor);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = total - ny * 12 + 1;
  return fromParts(ny, nm, Math.min(d, daysInMonth(ny, nm)));
}

/** Perbandingan string YYYY-MM-DD yang aman secara leksikografis. */
export function compareISO(a: ISODate, b: ISODate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Jumlah hari dari `from` sampai `to`, keduanya ikut dihitung. */
export function daysInclusive(from: ISODate, to: ISODate): number {
  const a = toParts(from);
  const b = toParts(to);
  const diff = Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / DAY_MS);
  if (diff < 0) throw new Error('Tanggal akhir tidak boleh sebelum tanggal awal');
  return diff + 1;
}

/**
 * Periode tagihan ke-`index` untuk penyewa yang masuk pada `moveIn`.
 * Siklus mengikuti tanggal masuk: periode 0 = moveIn s.d. sehari sebelum periode 1.
 * Tagihan dibayar di muka, jadi tanggal jatuh tempo = tanggal mulai periode.
 */
export function billingPeriod(moveIn: ISODate, index: number): BillingPeriod {
  const start = addMonthsClamped(moveIn, index);
  const end = addDays(addMonthsClamped(moveIn, index + 1), -1);
  return { index, start, end, dueDate: start };
}

/**
 * Daftar periode yang belum diterbitkan dan mulainya tidak melewati `asOf + leadDays`.
 * `issuedStarts` adalah tanggal mulai periode yang sudah punya tagihan, agar tidak ganda.
 */
export function periodsToIssue(
  moveIn: ISODate,
  issuedStarts: readonly ISODate[],
  asOf: ISODate,
  leadDays = 0,
): BillingPeriod[] {
  const issued = new Set(issuedStarts);
  const horizon = addDays(asOf, leadDays);
  const result: BillingPeriod[] = [];
  for (let i = 0; i < 600; i++) {
    const period = billingPeriod(moveIn, i);
    if (compareISO(period.start, horizon) > 0) break;
    if (!issued.has(period.start)) result.push(period);
  }
  return result;
}

export function roundRupiah(amount: number): number {
  return Math.round(amount);
}

/**
 * Prorata untuk potongan satu bulan kalender:
 * sewa × jumlah hari / jumlah hari dalam bulan, dibulatkan ke rupiah terdekat.
 */
export function prorateRent(monthlyRent: number, from: ISODate, to: ISODate): number {
  const a = toParts(from);
  const b = toParts(to);
  if (a.y !== b.y || a.m !== b.m) {
    throw new Error('Prorata hanya untuk rentang dalam satu bulan kalender');
  }
  const days = daysInclusive(from, to);
  return roundRupiah((monthlyRent * days) / daysInMonth(a.y, a.m));
}

export function sumLines(lines: readonly BillLine[]): number {
  let total = 0;
  for (const line of lines) {
    if (!Number.isInteger(line.amount)) throw new Error(`Nominal baris tagihan harus bilangan bulat: ${line.description}`);
    total += line.amount;
  }
  return total;
}

/**
 * Baris tagihan reguler: sewa kamar + biaya barang elektronik yang aktif.
 * Nilai disalin ke baris tagihan (snapshot), sehingga perubahan harga di masa depan tidak mengubah tagihan lama.
 */
export function buildRegularBillLines(
  monthlyRent: number,
  electronics: readonly { id: string; name: string; monthlyFee: number }[],
): BillLine[] {
  const lines: BillLine[] = [{ kind: 'sewa', description: 'Sewa kamar bulanan', amount: monthlyRent }];
  for (const item of electronics) {
    if (item.monthlyFee <= 0) continue;
    lines.push({
      kind: 'elektronik',
      description: `Biaya elektronik: ${item.name}`,
      amount: item.monthlyFee,
      electronicItemId: item.id,
    });
  }
  return lines;
}

export function billStatus(input: {
  total: number;
  paid: number;
  dueDate: ISODate;
  today: ISODate;
}): { status: BillStatus; remaining: number; isPartial: boolean } {
  const remaining = Math.max(0, input.total - input.paid);
  if (remaining === 0) return { status: 'lunas', remaining, isPartial: false };
  const cmp = compareISO(input.dueDate, input.today);
  const status: BillStatus = cmp < 0 ? 'terlambat' : cmp === 0 ? 'jatuh_tempo_hari_ini' : 'belum_jatuh_tempo';
  return { status, remaining, isPartial: input.paid > 0 };
}

/**
 * Mengalokasikan pembayaran ke tagihan terbuka, paling lama jatuh tempo lebih dulu.
 * Sisa yang tidak terpakai dikembalikan sebagai `unallocated` (kelebihan bayar).
 * Kelebihan bayar TIDAK otomatis dianggap omzet; pemilik yang menentukan statusnya.
 */
export function allocatePayment(
  amount: number,
  openBills: readonly OpenBill[],
): { allocations: Allocation[]; unallocated: number } {
  if (!Number.isInteger(amount) || amount <= 0) throw new Error('Nominal pembayaran harus bilangan bulat lebih dari 0');
  const sorted = openBills
    .filter((b) => b.remaining > 0)
    .slice()
    .sort((a, b) => compareISO(a.dueDate, b.dueDate) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  let left = amount;
  const allocations: Allocation[] = [];
  for (const bill of sorted) {
    if (left === 0) break;
    const take = Math.min(left, bill.remaining);
    allocations.push({ billId: bill.id, amount: take });
    left -= take;
  }
  return { allocations, unallocated: left };
}
