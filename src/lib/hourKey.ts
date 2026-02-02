function pad2(n: number) {
  return String(n).padStart(2, "0");
}

/**
 * Returns the current UTC hour key as YYYY-MM-DDTHH.
 * Example: 2026-02-02T18
 */
export function utcHourKey(d = new Date()): string {
  const y = d.getUTCFullYear();
  const m = pad2(d.getUTCMonth() + 1);
  const day = pad2(d.getUTCDate());
  const h = pad2(d.getUTCHours());
  return `${y}-${m}-${day}T${h}`;
}

export function prevUtcHourKey(hourKey: string): string {
  // hourKey: YYYY-MM-DDTHH
  const m = hourKey.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2})$/);
  if (!m) return hourKey;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const h = Number(m[4]);
  const dt = new Date(Date.UTC(y, mo - 1, d, h, 0, 0, 0));
  dt.setUTCHours(dt.getUTCHours() - 1);
  return utcHourKey(dt);
}


