import {
  listOcrLayoutsForPack,
  packAllowedConcreteLayouts,
  packPreferredLayoutId,
  packShowsLayoutChips,
} from '../../src/sources/ocr/packLayouts';

describe('packLayouts', () => {
  it('uses pack layouts when declared', () => {
    expect(
      packAllowedConcreteLayouts({
        engine: 'ocr-roster',
        layouts: ['month-matrix', 'week-strip', 'list-protocol'],
      })
    ).toEqual(['month-matrix', 'week-strip', 'list-protocol']);
  });

  it('defaults to non-stub concretes when pack omits layouts', () => {
    const ids = packAllowedConcreteLayouts({ engine: 'ocr-roster' });
    expect(ids).toContain('month-matrix');
    expect(ids).toContain('week-strip');
    expect(ids).not.toContain('day-plan');
  });

  it('chip list includes auto and hides stubs unless selected', () => {
    const chips = listOcrLayoutsForPack({
      engine: 'ocr-roster',
      layouts: ['month-matrix', 'week-strip'],
    });
    expect(chips.map((c) => c.id)).toEqual(['auto', 'month-matrix', 'week-strip']);

    const withStubSelected = listOcrLayoutsForPack(
      { engine: 'ocr-roster', layouts: ['month-matrix'] },
      'day-plan'
    );
    expect(withStubSelected.map((c) => c.id)).toContain('day-plan');
  });

  it('reads preferredLayout', () => {
    expect(packPreferredLayoutId({ engine: 'ocr-roster', preferredLayout: 'week-strip' })).toBe(
      'week-strip'
    );
    expect(packPreferredLayoutId({ engine: 'ocr-roster', preferredLayout: 'auto' })).toBe('auto');
    expect(packPreferredLayoutId({ engine: 'ocr-roster', preferredLayout: 'nope' })).toBeNull();
  });

  it('hides chips for auto unless showLayoutChips', () => {
    expect(packShowsLayoutChips({ engine: 'ocr-roster', preferredLayout: 'auto' })).toBe(false);
    expect(
      packShowsLayoutChips({
        engine: 'ocr-roster',
        preferredLayout: 'auto',
        showLayoutChips: true,
      })
    ).toBe(true);
  });
});
