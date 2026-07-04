// Feature: mobile-sdk53-upgrade — task 10.1 durability (withFrescoFlags plugin)
//
// Unit + property tests for the pure `applyFrescoFlags` transform that makes
// expo.gif.enabled=false / expo.webp.enabled=false survive `expo prebuild
// --clean` (which otherwise regenerates them to the Expo default `true`).

import fc from 'fast-check';

// The plugin is a CommonJS module; import its pure helper + constants.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const withFrescoFlags = require('../withFrescoFlags');
const { applyFrescoFlags, GIF_KEY, WEBP_KEY, COMMENT } = withFrescoFlags as {
  applyFrescoFlags: (items: PropItem[]) => PropItem[];
  GIF_KEY: string;
  WEBP_KEY: string;
  COMMENT: string;
};

type PropItem =
  | { type: 'property'; key: string; value: string }
  | { type: 'comment'; value: string }
  | { type: 'empty' };

/** Extract the value for a property key from a modResults array. */
function valueOf(items: PropItem[], key: string): string | undefined {
  const hit = items.find(
    (i): i is Extract<PropItem, { type: 'property' }> =>
      i.type === 'property' && i.key === key,
  );
  return hit?.value;
}

/** Count property entries for a given key. */
function countKey(items: PropItem[], key: string): number {
  return items.filter((i) => i.type === 'property' && i.key === key).length;
}

describe('applyFrescoFlags', () => {
  it('adds both flags as false when missing', () => {
    const result = applyFrescoFlags([
      { type: 'property', key: 'android.useAndroidX', value: 'true' },
    ]);
    expect(valueOf(result, GIF_KEY)).toBe('false');
    expect(valueOf(result, WEBP_KEY)).toBe('false');
  });

  it('overrides the Expo default true values', () => {
    const regenerated: PropItem[] = [
      { type: 'property', key: 'android.useAndroidX', value: 'true' },
      { type: 'property', key: GIF_KEY, value: 'true' },
      { type: 'property', key: WEBP_KEY, value: 'true' },
    ];
    const result = applyFrescoFlags(regenerated);
    expect(valueOf(result, GIF_KEY)).toBe('false');
    expect(valueOf(result, WEBP_KEY)).toBe('false');
    // no duplicate entries left behind
    expect(countKey(result, GIF_KEY)).toBe(1);
    expect(countKey(result, WEBP_KEY)).toBe(1);
  });

  it('preserves unrelated properties', () => {
    const result = applyFrescoFlags([
      { type: 'property', key: 'org.gradle.jvmargs', value: '-Xmx2g' },
      { type: 'comment', value: 'some other note' },
    ]);
    expect(valueOf(result, 'org.gradle.jvmargs')).toBe('-Xmx2g');
    expect(result.some((i) => i.type === 'comment' && i.value === 'some other note')).toBe(true);
  });

  it('is idempotent: applying twice yields the same result', () => {
    const once = applyFrescoFlags([
      { type: 'property', key: GIF_KEY, value: 'true' },
      { type: 'property', key: WEBP_KEY, value: 'true' },
    ]);
    const twice = applyFrescoFlags(once);
    expect(twice).toEqual(once);
    expect(countKey(twice, GIF_KEY)).toBe(1);
    expect(countKey(twice, WEBP_KEY)).toBe(1);
    expect(twice.filter((i) => i.type === 'comment' && i.value === COMMENT)).toHaveLength(1);
  });

  it('property: regardless of input, gif/webp end up exactly one false entry each', () => {
    const itemArb: fc.Arbitrary<PropItem> = fc.oneof(
      fc
        .record({ key: fc.string(), value: fc.constantFrom('true', 'false', 'x') })
        .map((r) => ({ type: 'property', key: r.key, value: r.value }) as PropItem),
      fc.string().map((value) => ({ type: 'comment', value }) as PropItem),
      fc.constant({ type: 'empty' } as PropItem),
    );

    fc.assert(
      fc.property(fc.array(itemArb), (items) => {
        const result = applyFrescoFlags(items);
        expect(countKey(result, GIF_KEY)).toBe(1);
        expect(countKey(result, WEBP_KEY)).toBe(1);
        expect(valueOf(result, GIF_KEY)).toBe('false');
        expect(valueOf(result, WEBP_KEY)).toBe('false');
        // idempotent for every input
        expect(applyFrescoFlags(result)).toEqual(result);
      }),
    );
  });
});
