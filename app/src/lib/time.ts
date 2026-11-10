// When something happened, the way the library says it: "just now",
// "5 min ago", "yesterday", "3 Nov".

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

export function ago(then: number, now = Date.now()): string {
  const d = now - then;
  if (d < MIN) return 'just now';
  if (d < HOUR) return `${Math.floor(d / MIN)} min ago`;
  const a = new Date(then);
  const b = new Date(now);
  const sameDay = a.toDateString() === b.toDateString();
  if (sameDay) return `${Math.floor(d / HOUR)} h ago`;
  const yesterday = new Date(now - DAY).toDateString() === a.toDateString();
  if (yesterday) return 'yesterday';
  if (d < 6 * DAY) return a.toLocaleDateString('en-GB', { weekday: 'long' });
  const opts: Intl.DateTimeFormatOptions =
    a.getFullYear() === b.getFullYear() ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' };
  return a.toLocaleDateString('en-GB', opts);
}
