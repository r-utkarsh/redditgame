/**
 * @file        tests/client/theme.test.ts
 * @purpose     Proves every text-on-background token pair used by the UI meets WCAG AA and tokens are well formed.
 * @covers      src/client/theme.ts
 * @spec        06-design-and-ux.md accessibility; P4-client.md step 1; D-027
 */
import { describe, expect, it } from 'vitest';
import {
  COLORS,
  CONTRAST_PAIRS,
  FONTS,
  RADIUS_PX,
  SPACE_PX,
  TYPE_PX,
  contrastRatio,
  relativeLuminance,
} from '../../src/client/theme';

describe('theme contrast', () => {
  it.each(CONTRAST_PAIRS)('$name meets AA at 4.5:1', ({ foreground, background }) => {
    expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(4.5);
  });

  it('computes known luminance extremes', () => {
    expect(relativeLuminance('#000000')).toBe(0);
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 5);
  });

  it('rejects a malformed hex colour', () => {
    expect(() => relativeLuminance('#12')).toThrow('hex colour');
  });

  it('keeps every text pair on a defined token', () => {
    const values = Object.values(COLORS);

    for (const pair of CONTRAST_PAIRS) {
      expect(values).toContain(pair.foreground);
      expect(values).toContain(pair.background);
    }
  });
});

describe('theme tokens', () => {
  it('uses only positive numeric sizes', () => {
    for (const size of [
      ...Object.values(TYPE_PX),
      ...Object.values(SPACE_PX),
      ...Object.values(RADIUS_PX),
    ]) {
      expect(size).toBeGreaterThan(0);
    }
  });

  it('ships system fonts only', () => {
    expect(FONTS.body).toContain('system-ui');
    expect(FONTS.mono).toContain('ui-monospace');
    expect(FONTS.body).not.toContain('http');
    expect(FONTS.mono).not.toContain('http');
  });
});
