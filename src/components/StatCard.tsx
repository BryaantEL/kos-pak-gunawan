type Tone = 'default' | 'warn' | 'ok';

export function StatCard({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: Tone;
}) {
  return (
    <div className="card stat">
      <p className="muted small">{label}</p>
      <p className={`stat-value tone-${tone}`}>{value}</p>
      {hint ? <p className="muted small">{hint}</p> : null}
    </div>
  );
}
