import { formatRupiah } from '@/lib/money';
import { getServerSupabase, unwrap } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

interface RoomRow {
  id: string;
  number: string;
  floor: number;
  monthly_rent: number;
}

interface TenancyRow {
  room_id: string;
  tenancy_occupants: {
    is_primary: boolean;
    tenants: { full_name: string } | null;
  }[];
}

export default async function RoomsPage() {
  const db = getServerSupabase();
  const [roomsRes, tenanciesRes] = await Promise.all([
    db.from('rooms').select('id, number, floor, monthly_rent').order('number'),
    db
      .from('tenancies')
      .select('room_id, tenancy_occupants(is_primary, tenants(full_name))')
      .is('end_date', null),
  ]);

  const rooms = unwrap<RoomRow>(roomsRes);
  const tenancies = unwrap<TenancyRow>(tenanciesRes);
  const tenantByRoom = new Map<string, string>();
  for (const t of tenancies) {
    const primary = t.tenancy_occupants.find((o) => o.is_primary) ?? t.tenancy_occupants[0];
    tenantByRoom.set(t.room_id, primary?.tenants?.full_name ?? 'Tanpa nama');
  }

  const floors = [1, 2];

  return (
    <>
      <h1 className="page-title">Data Kamar</h1>
      <p className="muted small">Daftar 21 kamar. Pengubahan data kamar akan tersedia pada tahap berikutnya.</p>

      {rooms.length === 0 ? (
        <section className="card empty section">Belum ada kamar.</section>
      ) : (
        floors.map((floor) => {
          const list = rooms.filter((r) => r.floor === floor);
          return (
            <section key={floor} className="section">
              <h2 className="section-title">Lantai {floor}</h2>
              <div className="grid-rooms">
                {list.map((room) => {
                  const tenant = tenantByRoom.get(room.id);
                  const occupied = tenant !== undefined;
                  return (
                    <article key={room.id} className="card room-card">
                      <div className="room-head">
                        <span className="room-number">{room.number}</span>
                        <span className={`badge ${occupied ? 'badge-filled' : 'badge-empty'}`}>
                          {occupied ? 'Terisi' : 'Kosong'}
                        </span>
                      </div>
                      <p className="small">{occupied ? tenant : <span className="muted">Belum ada penyewa</span>}</p>
                      <p className="small muted">
                        {room.monthly_rent > 0 ? `${formatRupiah(room.monthly_rent)} / bulan` : 'Harga sewa belum diatur'}
                      </p>
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })
      )}
    </>
  );
}
