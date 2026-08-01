# OCR month-matrix — cell-frame correction plan

**Status:** active correction plan (engineering)  
**Last implementation pass:** 2026-07-29
**Scope:** detect printed **name / day / shift** cell frames on wall-plan photos, scoop OCR into those frames, overlay for review.  
**Non-goal:** cloud OCR, second “try another layout” path, adb/device dumps as a substitute for geometry fixes.

Related: [`ocr-camera-source.md`](./ocr-camera-source.md), [`architecture.md`](./architecture.md).

---

## 0. Hard rules (non-negotiable)

1. **No sensitive data in code or committed docs examples**
   - Forbidden in `src/`, committed tests, comments, log strings, commit messages, PR bodies that ship with the repo: real person names, employer-specific roster titles, private photo stems, fixture case IDs that encode surnames, coordinates tied to a named private photo.
   - Allowed: generic calendar labels (`Mo1`, `Di2`), synthetic fixtures under `tests/fixtures/ocr/` with fake names, normalized geometry numbers without photo identity.
   - Private validation stays under gitignored paths (e.g. `tmp/test-files/`) or `$SHIFTPLAN_OCR_PRIVATE`. Never cite those stems in source comments.
2. **One path, no retries / silent fallbacks** (workspace rule). If lattice quality is insufficient → fail the step with a clear reason (or keep a single explicit degraded mode that is logged, not a second click path).
3. **Overlays are judged visually against printed black lines**, not only center-Y against region GT.
4. **Structure first, text second:** H×V ruled lattice defines frames; OCR fills frames. Text must not invent the grid when lines are visible.

---

## 1. Definition of done

A photo of a printed month matrix is “frame-correct” when:

| Region | Must match |
|--------|------------|
| **Name column** | Left edge ≈ left table border; right edge ≈ vertical rule between names and day 1 (not mid-calendar). |
| **Day header** | One strip per calendar day; top/bottom on the header H-rules; left/right on consecutive V-rules (or equal-pitch repair only when V is missing). |
| **Own / person row** | Full printed person block height (1–3 duty sub-rows), no bleed into neighbor persons. |
| **Shift cell** | Intersection of person band × day column; glyphs scooped only inside that rectangle (skew-aware). |

**Acceptance (professional bar):**

- On private validation set: overlays sit on printed lines for ≥90% of day columns and ≥90% of person rows (manual checklist or pixel-vs-makierung IoU ≥ 0.7 per box).
- Unit tests use **synthetic** lattices + fake OCR lines only (committed).
- No fixture surnames / private stems in `src/**` comments or strings.

---

## 2. Current state (honest)

Today’s pipeline is a **hybrid**, not yet a production layout engine:

```
photo → gray lattice (H/V peaks)
     → OCR lines (page space)
     → day columns mostly from OCR headers + gap-fill
     → optional V-snap (gated; often skipped when V peaks are sparse)
     → person bands from H separators (else soft midpoints)
     → scoop text into bands × columns
     → overlay from stored yLo/yHi + colCenters
```

**Why frames still miss:**

| Failure mode | Effect |
|--------------|--------|
| Weak / sparse **V** peaks | Day columns fall back to OCR X; perspective → uneven pitch; leading days invented with constant pitch. |
| **nameMaxX** from day headers when early days are missing | Divider sits mid-month; early day boxes land in the name column. |
| Soft person separators | Single-line rows look “thin”; multiline blocks OK only when H-lines exist between people. |
| Constant pitch repair | Ignores perspective (left cells ≠ right cell width). |
| Region GT “pass” | Mostly mean \|Δy\| on centers — can “pass” while overlays look wrong. |

**Scalability today:** page scale from probe gray → page, plus **one-path projective rectification** when header skew / pitch-CV gates pass (`perspective.ts`). Extreme angles without a usable table quad still fail closed (no warp).

---

## 3. Target architecture (professional, scalable)

### 3.1 Coordinate spaces (explicit)

| Space | Role |
|-------|------|
| **Image** | Camera / JPEG pixels (EXIF-oriented). Lattice detection runs here (or on downscaled gray with known scale). |
| **Page** | OCR bounding-box space (after `prepareImage`). All scoop + overlay math lives here. |
| **Norm** | 0..1 for UI overlays / region GT (page or display — pick one and document; export must resize photo → page before paint). |

Every transform is a named function with tests: `image→page`, `page→norm`. No silent mixing.

### 3.2 Frame model (what a “cell” is)

```
TableFrame
  nameDividerX(y)     // vertical rule between names and days (may be skew: X as f(y))
  headerBand { yTop, yBot }   // from H-rules above first person
  dayCols[] { x0, x1, day, wd }  // from consecutive V-rules (preferred)
  personRows[] { y0, y1, nameKey } // from consecutive H-rules (preferred)
  rowSlope / optional homography
```

**Shift cell (i, j)** = rectangle (or parallelogram under skew):

- `x ∈ [dayCols[j].x0, dayCols[j].x1]` at row mid-Y (or skewed edges)
- `y ∈ [personRows[i].y0, personRows[i].y1]` at column mid-X

OCR glyph belongs to cell if its center (or majority of box) lies inside that parallelogram — **one** ownership rule, no second scoop path.

### 3.3 Day-count model (months)

| Input | Behavior |
|-------|----------|
| Month + year known (OCR title / user / pack) | Exactly `daysInMonth(y, m)` columns. Missing days filled by lattice pitch or calendar interpolation; extras dropped. |
| Only weekday+day labels | Unique days 1..31 as observed; fill internal gaps ≤ N; optional leading fill if first day > 1 **only when** lattice has empty columns to the left of first OCR day. |
| Unknown length | Prefer **lattice column count** (V gaps right of name divider) over assuming 28 or 31. Cap at 31. Never invent days past last V-column. |

Min/max is therefore: **lattice-driven count**, calendar-clamped to 28–31 when month known — not “always 31”.

### 3.4 Scaling & perspective (must become yes)

Phased geometric robustness:

1. **Affine / slope (now):** `y' = y0 + slope * (x - x0)` for row baselines and header strip.
2. **Piecewise pitch (next):** day width = median of local V-gaps; do not force global constant pitch across the full width.
3. **Homography (later, if needed):** estimate 4-corner table quad from outer H/V; warp lattice + OCR into a canonical table space; run frame logic there; map overlays back. This is the professional answer to “different distances / angles always scale.”

Until (3) ships: document as **“frontal / mild skew only.”** Fail or warn when lattice score or residual skew exceeds a threshold.

---

## 4. Fine-grained work packages

### WP0 — Privacy hygiene (do first, continuous)

| # | Task | Done when |
|---|------|-----------|
| 0.1 | Audit `src/sources/ocr/**` comments/strings for private stems, surnames, employer titles | Zero hits in CI grep allowlist |
| 0.2 | Add CI or script check: fail if patterns like private dump paths / known forbidden tokens appear under `src/` | Script in `scripts/dev/` or lint |
| 0.3 | Keep private photos / makierung / dumps gitignored; committed docs use only synthetic examples (`Mo1`, `roster-a.jpg`) | Review checklist |

### WP1 — Lattice quality (H and V)

| # | Task | Done when |
|---|------|-----------|
| 1.1 | Adaptive peak threshold: if V count ≪ expected day count, lower thr **once** with a logged reason (not a retry loop of actions) | Unit test on synthetic grids |
| 1.2 | Restrict V search to table ROI (right of provisional name divider, below header, above footer) | Fewer frame-border false peaks |
| 1.3 | Min separation from expected day pitch (median gap) instead of only `1/80` of width | Dense day rules recovered |
| 1.4 | Score lattice: `nH`, `nV`, regularity; expose `lattice.ok` / `reason` | UI can say “grid lines weak” |
| 1.5 | Never blind-snap OCR centers if `keepRatio < 0.85` (keep current gate); prefer **replace** centers by V midpoints when lattice.ok | Documented contract |

### WP2 — Name divider (nameMaxX)

| # | Task | Done when |
|---|------|-----------|
| 2.1 | Primary: surname-token right edge (median), ignore parentheticals | Synthetic test |
| 2.2 | Secondary: densest day-header Y-band leftmost X | No title-weekday pollution |
| 2.3 | Tertiary: leftmost strong V in table ROI | When OCR names sparse |
| 2.4 | Divider may be `x(y)` under skew (nameColRightAtY already partial) — wire lattice V at name edge | Overlay name strip follows rule |

### WP3 — Day columns

| # | Task | Done when |
|---|------|-----------|
| 3.1 | Prefer `dayColBoundsFromVerticals` when `lattice.ok` | Centers = midpoints of V gaps |
| 3.2 | OCR labels attach to nearest lattice column (label ≠ geometry) | Labels can be wrong X; frames stay |
| 3.3 | Gap-fill only inside lattice span; no leading days left of name divider | No Sa-in-name-column |
| 3.4 | Monotonic day repair uses **local** pitch (sliding window), not one global pitch | Right side doesn’t crush |
| 3.5 | Month known → force column count; unknown → lattice count | See §3.3 |
| 3.6 | Deduplicate by day number; sort by day; X from lattice | No stacked Fr14/Do13 |

### WP4 — Person rows (multiline)

| # | Task | Done when |
|---|------|-----------|
| 4.1 | Separators = H-rules in lower portion of name-to-name gaps (keep) | Multiline blocks intact |
| 4.2 | If ≥2 H-rules between names, prefer outer rules as person frame (inner = duty sub-rows, not person borders) | Sub-row lines don’t split one person |
| 4.3 | Soft midpoint only when no H in gap; mark `bandSource: 'soft'` | Overlay / metrics can flag |
| 4.4 | Enforce disjoint bands after assignment | No neighbor overlap |

### WP5 — Scoop + overlays

| # | Task | Done when |
|---|------|-----------|
| 5.1 | Single ownership: glyph → (row, col) from frame parallelogram | Remove ambiguous dual rules |
| 5.2 | Name glyphs never enter day scoop (`x` / center left of divider) | Synthetic regression |
| 5.3 | Overlay boxes = exact stored frames (no fake equal day strips) | Visual = math |
| 5.4 | Export paint always in **page** space (resize photo → pageW×pageH) | No 4096-vs-3000 drift |

### WP6 — Validation (without leaking private data)

| # | Task | Done when |
|---|------|-----------|
| 6.1 | Committed: synthetic image + OCR JSON tests for lattice, divider, day count, scoop | CI green |
| 6.2 | Private: overlay export + IoU / checklist vs makierung (gitignored) | Local only |
| 6.3 | Replace region “pass” with **frame IoU** thresholds (own-row height ratio, day-x IoU) | Center-Y alone insufficient |
| 6.4 | REPORT.md / debug logs: case **hashes** or `case-01`, never surnames in committed artifacts | Privacy |

### WP7 — Perspective / scale (make “scalable” real)

| # | Task | Done when |
|---|------|-----------|
| 7.1 | Measure residual: day pitch CV (coefficient of variation) across width | Gate |
| 7.2 | If CV high → piecewise column widths from local V gaps | Better mid-angle photos |
| 7.3 | Optional homography path behind feature flag; one path per run | Documented |
| 7.4 | Capture guidance: UI hint “fill frame, avoid extreme angle” when lattice.ok false | Product |

---

## 5. Suggested implementation order

```
WP0 (privacy) ──► WP1 (lattice V/H) ──► WP2 (divider) ──► WP3 (day frames)
                                                              │
                                                              ▼
                                                         WP4 (person frames)
                                                              │
                                                              ▼
                                                         WP5 (scoop/overlay)
                                                              │
                                                              ▼
                                                         WP6 (validation bar)
                                                              │
                                                              ▼
                                                         WP7 (perspective)
```

Do **not** start WP7 until WP1–WP5 pass on frontal private set. Homography without reliable H/V is wasted work.

---

## 6. Module map (where to change)

| Concern | Primary files |
|---------|----------------|
| H/V detection | `src/sources/ocr/layouts/imageGrid.ts` |
| Lattice → day/person bounds | `src/sources/ocr/layouts/month-matrix/lattice.ts`, `rowOwnership.ts` |
| Day labels / gap-fill / nameMaxX | `src/sources/ocr/layouts/month-matrix/dayHeaders.ts` |
| Orchestration | `src/sources/ocr/layouts/month-matrix/build.ts` |
| Overlays | `src/sources/ocr/highlightOverlay.ts` |
| Prepare / page size | `src/sources/ocr/prepareImage.ts`, `cameraOcr.ts` |
| Perspective / homography | `src/sources/ocr/homography.ts`, `perspective.ts` |
| GT check | `src/sources/ocr/regionGroundTruth.ts` |
| Private export harness | `tests/unit/_exportRosterOverlays.test.ts` (gitignored inputs only) |

Keep pack JSON free of geometry logic. Layout stays in `sources/ocr/`.

---

## 7. Explicit non-fixes

- Pulling new device dumps via adb as the “fix”.
- Retry loops / second deep-link / soft recoveries.
- Committing private photos, makierungen, or surname-bearing comments.
- Claiming success from center-Y GT alone.
- Assuming every month has 31 days when lattice shows fewer columns.

---

## 8. Exit criteria checklist

- [x] WP0 privacy hygiene: no roster names / private dump stems in committed tests/docs/scripts (LICENSE author text remains)  
- [x] Lattice quality now gates V-snap / frame usage and stores quality diagnostics  
- [x] Name divider stays OCR-name-first; day-scoop excludes name glyphs via skew-aware y-divider  
- [x] Person bands prefer printed H frames and persist frame source (`ruled` / `soft`)  
- [~] Overlay validation includes frame IoU; private local export (2026-07-29): case-01 own~0.81; case-03 header~0.83; case-04 no longer full-bleed (content clamp + no page-edge V) — sparse-H / steep-skew cases still weak
- [x] Synthetic unit tests cover lattice quality, content-clipped V, row bands, skewed overlay segments, outer-H person separators
- [x] Skew/perspective: robust table-quad estimation + hard gates (residual, convexity, pitch-CV, post-slope); one-path camera rectification maps frames back to page space  

When all boxes are checked, the approach is **professional enough to call scalable** for intended capture conditions; until then it remains an engineering hybrid.
