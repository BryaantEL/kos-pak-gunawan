import { daysInMonth, type ISODate } from './billing.ts';

/** Tanggal hari ini di zona waktu Jakarta (YYYY-MM-DD). */
export function todayJakarta(now: Date = new Date()): ISODate {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** Awal dan akhir bulan kalender dari sebuah tanggal. */
export function monthRange(iso: ISODate): { start: ISODate; end: ISODate } {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  const ym = `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}`;
  const last = String(daysInMonth(y, m)).padStart(2, '0');
  return { start: `${ym}-01`, end: `${ym}-${last}` };
}
