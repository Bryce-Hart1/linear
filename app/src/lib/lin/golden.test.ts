// The golden file: drawBridge's sample diagram as drawBridge writes it.
// linear must read it and write it back byte for byte (the plan's "strict v1").

import { describe, expect, it } from 'vitest';
import flow from './fixtures/flow.lin?raw';
import { parseLin, serializeLin } from './format';
import { SAMPLE_DIAGRAM } from './sample';

describe('the golden .lin', () => {
  it('reads and writes back unchanged', () => {
    expect(serializeLin(parseLin(flow))).toBe(flow);
  });

  it('is exactly what the sample serialises to', () => {
    expect(serializeLin(SAMPLE_DIAGRAM)).toBe(flow);
  });

  it('survives a second round trip', () => {
    const once = serializeLin(parseLin(flow));
    expect(serializeLin(parseLin(once))).toBe(flow);
  });
});
