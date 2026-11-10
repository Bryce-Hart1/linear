import { describe, expect, it } from 'vitest';
import { ago } from './time';

const now = new Date(2026, 10, 9, 15, 0).getTime();
const at = (...a: [number, number, number, number?, number?]) => new Date(a[0], a[1], a[2], a[3] ?? 12, a[4] ?? 0).getTime();

describe('ago', () => {
  it('says how long ago, coarser as it gets older', () => {
    expect(ago(now - 20_000, now)).toBe('just now');
    expect(ago(now - 5 * 60_000, now)).toBe('5 min ago');
    expect(ago(at(2026, 10, 9, 11), now)).toBe('4 h ago');
    expect(ago(at(2026, 10, 8, 23), now)).toBe('yesterday');
    expect(ago(at(2026, 10, 5), now)).toBe('Thursday');
    expect(ago(at(2026, 9, 3), now)).toBe('3 Oct');
    expect(ago(at(2025, 9, 3), now)).toBe('3 Oct 2025');
  });
});
