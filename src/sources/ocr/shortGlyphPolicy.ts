/**
 * Tunable thresholds for short-glyph shape match (U, /).
 * Kept in one place so eval/tuning does not scatter magic numbers.
 *
 * Not duty classification — pack mapping still owns U→Urlaub.
 */
export const SHORT_GLYPH_POLICY = {
  /** Minimum (B−R) mean for pale-on-blue "U" cup. */
  uMinBlueDelta: 48,
  /** Minimum luma span (p90−p10); flat empty blue has ~5–12. */
  uMinContrast: 18,
  uMinStem: 0.08,
  uMinStems: 0.16,
  uMinMidBot: 0.08,
  uMinScore: 0.48,
  uMinInkFrac: 0.03,
  uMaxInkFrac: 0.42,
  /** Accept U hit into the grid only at this score (invert pass). */
  uAcceptScore: 0.5,
  /** Gray weekend paper for slash ink. */
  grayMinLuma: 78,
  grayMaxLuma: 125,
  grayMaxBlueDelta: 25,
  slashMinAlignGray: 0.6,
  slashMinAlignOther: 0.7,
  slashMaxInkFrac: 0.32,
  slashMinInkFrac: 0.02,
  /** Weekend mark without clean slash geometry (phone JPEG). */
  weekendMarkMinInk: 0.04,
  weekendMarkMaxInk: 0.45,
  weekendMarkMinContrast: 18,
  weekendMarkMinLuma: 60,
  weekendMarkMaxLuma: 130,
} as const;

/** Vacation-run policy after short-glyph evidence is applied. */
export const VACATION_RUN_POLICY = {
  /**
   * Max column distance between two U seeds that may be bridged.
   * Larger gaps are separate clusters (blocks day-9→day-18 paint).
   */
  maxSeedGap: 6,
  /** Default vacation code before pack alias canonicalize. */
  defaultCode: 'U',
} as const;
