export function ymdUtc(date: Date): { yyyy: string; mm: string; dd: string } {
  const iso = date.toISOString().slice(0, 10);
  const [yyyy, mm, dd] = iso.split("-");
  return { yyyy, mm, dd };
}
