/**
 * Capture → OCR → month-matrix grid → name pick → full matrix text for review.
 * Does not ingest. See docs/dev/ocr-camera-source.md.
 */
import { t } from '../i18n';
import { getOcrEngine } from '../convert/parsers/ocr';
import { finalizeShortGlyphVacation } from './ocr/vacationFinalize';
import {
  assessMatrixUsability,
  type MatrixUsabilityReason,
} from './ocr/matrixUsability';
import {
  getMappingForScope,
  getPackById,
  getOcrEngineIdForPack,
  getOcrConfigForScope,
} from '../packs';
import { loadOcrLayoutId } from '../state/ocrLayout';
import {
  loadOcrPreferredName,
  saveOcrPreferredName,
} from '../state/ocrPreferredName';
import {
  loadOcrNameAliases,
  rememberOcrNameAlias,
} from '../state/ocrNameAliases';
import { getSnapshot } from '../state/store';
import { captureOcrImage, type OcrCaptureMode } from './ocr/capture';
import { deskewDegreesFromGray, deskewDegreesFromOcrLines, rotateImageDegrees } from './ocr/deskew';
import { maybeDumpOcrGeometry } from './ocr/geometryDump';
import {
  applyInvertCellHitsToGrid,
  ocrEmptyCellsViaInvert,
} from './ocr/invertCellOcr';
import { mergeInvertOcrLines } from './ocr/invertOcrPass';
import {
  applyOcrLayoutPostprocess,
  DEFAULT_OCR_LAYOUT_ID,
  getOcrLayout,
  isAutoOcrLayout,
  isOcrTextOnlyFallback,
  OCR_TEXT_ONLY_FALLBACK,
  type OcrLayoutId,
} from './ocr/layouts';
import {
  detectLayoutFromImageUri,
  loadGrayImageForLayout,
} from './ocr/layouts/detectFromImage';
import {
  detectRuledLattice,
  scaleLatticeToPage,
  uprightRotateDegreesFromGray,
} from './ocr/layouts/imageGrid';
import { detectOcrLayout, mergeLayoutDetections } from './ocr/detectLayout';
import { analyzeLayoutUncertainty } from './ocr/layoutUncertainty';
import { packAllowedConcreteLayouts } from './ocr/packLayouts';
import { captureAutoSnapshots, type OcrRegionSnapshot } from './ocr/regionSnapshots';
import { buildDateDutyGrid } from './ocr/layouts/date-duty';
import { buildWeekStripGrid } from './ocr/layouts/week-strip';
import type { ConcreteOcrLayoutId } from './ocr/layouts/types';
import type {
  OcrLayoutPickRequest,
  OcrLayoutPickResult,
} from '@/src/ui/OcrLayoutPickerModal';
import type {
  OcrRegionAssistRequest,
  OcrRegionAssistResult,
} from '@/src/ui/OcrRegionAssistModal';
import {
  biasLinesByPaintedRegions,
  buildOwnRowAssistGrid,
  relaxAssistGridOk,
} from './ocr/assistPaintedRegions';
import {
  buildMonthMatrixGrid,
  computeMonthMatrixMetrics,
  formatMonthMatrixTable,
  matrixRowsAsNameCandidates,
  type MonthMatrixGrid,
  type MonthMatrixMetrics,
} from './ocr/layouts/month-matrix';
import { inferNameMaxX } from './ocr/layouts/month-matrix/dayHeaders';
import {
  buildPerspectiveRectifier,
  projectGridFromRectified,
  transformLatticeByHomography,
  transformLinesByHomography,
} from './ocr/perspective';
import {
  applyKnownSpellingsToGridRows,
  applySavedNameSpellings,
  detectRosterNames,
  detectRosterNamesFromPlainText,
  isPlausiblePersonName,
  matchPreferredName,
  normalizeNameKeyPublic,
  OCR_AUTO_NAME_MIN_SCORE,
  resolveConfirmedRosterLabel,
  type OcrNameCandidate,
} from './ocr/names';
import { persistOcrGeometryDump } from './ocr/persistGeometryDump';
import { prepareImageForOcr } from './ocr/prepareImage';
import { isOcrNativeAvailable, recognizeImageText, type OcrLine } from './ocr/recognize';
import type { Source, SourceRunOpts, SourceRunResult } from './types';

/** @deprecated Prefer OcrCaptureMode (`scan` | `camera` | `gallery`). */
export type CameraOcrPickMode = 'camera' | 'gallery';

export type OcrNamePickRequest = {
  candidates: OcrNameCandidate[];
  suggestedId?: string | null;
  preferredLabel?: string | null;
};

/** Result of the name picker (label may be user-corrected). */
export type OcrNamePickResult = {
  id: string;
  label: string;
};

export type CameraOcrRunOpts = SourceRunOpts & {
  pickMode?: CameraOcrPickMode;
  captureMode?: OcrCaptureMode;
  /** Bypass picker — local file:// or content:// URI (dev / e2e only). */
  imageUri?: string;
  layoutId?: OcrLayoutId | string;
  cropImage?: (uri: string) => Promise<string | null>;
  pickRosterName?: (req: OcrNamePickRequest) => Promise<OcrNamePickResult | null>;
  /** When auto detection is uncertain — user picks one layout (one path). */
  pickOcrLayout?: (req: OcrLayoutPickRequest) => Promise<OcrLayoutPickResult | null>;
  /** Name/date unclear — paint regions, rotate, or rephotograph. */
  assistOcrRegion?: (req: OcrRegionAssistRequest) => Promise<OcrRegionAssistResult>;
  autoSelectPreferred?: boolean;
  /**
   * Force post-OCR deskew even for mild tilts (&lt;4°).
   * Steep header skew (≥4°) already auto-straightens once on gallery/camera.
   * Scan mode skips deskew (document scanner warps).
   */
  autoDeskew?: boolean;
};

export type CameraOcrRunResult = SourceRunResult & {
  /** Concrete layout used for this run, or text-only fallback (never `auto`). */
  layoutId: string;
  /** User/chip selection before auto-resolve (`auto` or concrete). */
  requestedLayoutId?: string;
  selectedName?: string | null;
  /** Structured grid for scrollable table UI (null when not built). */
  matrix?: MonthMatrixGrid | null;
  /** One-shot grid quality (headers / rows / day coverage). */
  matrixMetrics?: MonthMatrixMetrics | null;
  /** Original capture URI for Abrufen photo↔table compare. */
  imageUri?: string | null;
  /** Auto region crops after confident grid (on-device). */
  regionSnapshots?: OcrRegionSnapshot[] | null;
  /** Layout detection score when auto ran. */
  layoutScore?: number | null;
  /** OCR page size (pixels) for highlight overlay mapping. */
  pageWidth?: number | null;
  pageHeight?: number | null;
};

function statusForCapture(mode: OcrCaptureMode): string {
  if (mode === 'gallery') return t('sourceOcrStatusGallery');
  if (mode === 'scan') return t('sourceOcrStatusScan');
  return t('sourceOcrStatusCamera');
}

function toCandidates(
  rows: { id: string; label: string; yCenter: number; height: number }[]
): OcrNameCandidate[] {
  return rows
    .filter((r) => isPlausiblePersonName(r.label))
    .map((r) => ({
      id: r.id,
      label: r.label,
      yCenter: r.yCenter,
      height: r.height,
    }));
}

function matrixFailedHint(
  ocr: { text: string; lines: unknown[] } | undefined,
  reason?: MatrixUsabilityReason | null
): string {
  if (ocr && !ocr.lines.length && ocr.text) {
    return t('sourceOcrMatrixFailedNoBoxes', {
      chars: ocr.text.length,
      lines: ocr.lines.length,
    });
  }
  if (reason === 'layout-mismatch') return t('sourceOcrMatrixFailedLayoutHint');
  if (
    reason === 'low-fill' ||
    reason === 'junk-names' ||
    reason === 'no-plausible-names' ||
    reason === 'too-few-rows'
  ) {
    return t('sourceOcrMatrixFailedQualityHint');
  }
  return t('sourceOcrMatrixFailedHint');
}

function matrixFailedResult(
  layoutId: string,
  ocr?: { text: string; lines: unknown[] },
  imageUri?: string | null,
  reason?: MatrixUsabilityReason | null
): CameraOcrRunResult {
  const lines = [t('sourceOcrMatrixFailedTitle'), '', matrixFailedHint(ocr, reason)];
  const rawText = lines.join('\n');
  return {
    artifacts: [{ kind: 'text', text: applyOcrLayoutPostprocess(layoutId, rawText) }],
    errors: [],
    layoutId,
    selectedName: null,
    matrix: null,
    imageUri: imageUri ?? null,
  };
}

/**
 * Run capture → OCR → matrix (+ name selection). Empty when cancelled. No ingest.
 */
export async function runCameraOcr(opts: CameraOcrRunOpts = {}): Promise<CameraOcrRunResult> {
  const mode: OcrCaptureMode = opts.captureMode || opts.pickMode || 'gallery';
  const requestedLayoutId =
    opts.layoutId || (await loadOcrLayoutId(DEFAULT_OCR_LAYOUT_ID));

  if (!isOcrNativeAvailable()) {
    throw new Error(t('sourceOcrNativeMissing'));
  }

  let captured: string | null = opts.imageUri || null;
  if (!captured) {
    // Only when this function opens the picker itself (not Fetch pre-capture).
    opts.onStatus?.({ line: statusForCapture(mode) });
    captured = await captureOcrImage(mode);
  }
  if (!captured) {
    return {
      artifacts: [],
      errors: [],
      layoutId: isAutoOcrLayout(requestedLayoutId)
        ? OCR_TEXT_ONLY_FALLBACK
        : requestedLayoutId,
      requestedLayoutId,
      matrix: null,
      imageUri: null,
    };
  }

  let sourceImageUri = captured;
  let uri = captured;
  if (opts.cropImage) {
    opts.onStatus?.({ line: t('sourceOcrStatusCrop') });
    const cropped = await opts.cropImage(captured);
    if (!cropped) {
      return {
        artifacts: [],
        errors: [],
        layoutId: isAutoOcrLayout(requestedLayoutId)
          ? OCR_TEXT_ONLY_FALLBACK
          : requestedLayoutId,
        requestedLayoutId,
        matrix: null,
        imageUri: sourceImageUri,
      };
    }
    uri = cropped;
  }

  opts.onStatus?.({ line: t('sourceOcrStatusPreparing') });
  try {
    uri = await prepareImageForOcr(uri);
  } catch {
    // Keep original URI — OCR may still work on full-res.
  }

  // Content upright (±90°) + mild deskew from pixel lattice — before any OCR.
  // One rotate path only (no second OCR). Scan mode already warps.
  let preOcrDeskewed = false;
  if (mode !== 'scan') {
    try {
      const gray = await loadGrayImageForLayout(uri);
      if (gray) {
        const turn = uprightRotateDegreesFromGray(gray);
        let probe = gray;
        if (turn) {
          const rotated = await rotateImageDegrees(uri, turn);
          if (rotated) {
            uri = rotated;
            sourceImageUri = rotated;
            // Refresh probe after ±90 (cheap CW chain for ±90 only).
            const again = await loadGrayImageForLayout(uri);
            if (again) probe = again;
          }
        }
        const skewDeg = deskewDegreesFromGray(probe);
        if (skewDeg) {
          opts.onStatus?.({ line: t('sourceOcrStatusDeskew') });
          const straightened = await rotateImageDegrees(uri, -skewDeg);
          if (straightened) {
            uri = straightened;
            sourceImageUri = straightened;
            preOcrDeskewed = true;
          }
        }
      }
    } catch {
      // Keep prepared URI.
    }
  }

  // Pro order: layout from image lattice first (not OCR text).
  let imageLayout: Awaited<ReturnType<typeof detectLayoutFromImageUri>> = null;
  if (isAutoOcrLayout(requestedLayoutId)) {
    opts.onStatus?.({ line: t('sourceOcrStatusDetectLayout') });
    try {
      imageLayout = await detectLayoutFromImageUri(uri);
    } catch {
      imageLayout = null;
    }
  }

  opts.onStatus?.({ line: t('sourceOcrStatusRecognizing') });
  try {
    let ocr = await recognizeImageText(uri);
    maybeDumpOcrGeometry(ocr);

    // Steep header lattice → one straighten + OCR (gallery/camera). Scan already warps.
    // Pre-OCR pixel deskew covers clean ruled tilts; this catches perspective header strips
    // where edge-projection stays flat but day labels run on a diagonal.
    const deg = deskewDegreesFromOcrLines(ocr.lines, ocr.pageWidth || 1);
    const wantDeskew =
      mode !== 'scan' &&
      !preOcrDeskewed &&
      deg !== 0 &&
      (opts.autoDeskew === true || Math.abs(deg) >= 4);
    if (wantDeskew) {
      opts.onStatus?.({ line: t('sourceOcrStatusDeskew') });
      const straightened = await rotateImageDegrees(uri, -deg);
      if (straightened) {
        try {
          const ocr2 = await recognizeImageText(straightened);
          if (ocr2.lines.length) {
            uri = straightened;
            sourceImageUri = straightened;
            ocr = ocr2;
            maybeDumpOcrGeometry(ocr);
          }
        } catch {
          // Keep first OCR — deskew is optional refinement.
        }
      }
    }

    // Pack-opt-in light-on-dark: frame-aware cell OCR runs after month-matrix lattice.
    {
      const snapInv = getSnapshot();
      const ocrCfgInv = getOcrConfigForScope(
        getPackById(snapInv.packId),
        snapInv.groupId,
        snapInv.areaId
      );
      if (ocrCfgInv.invertLightGlyphs !== true) {
        // eslint-disable-next-line no-console
        console.log('[ocr-invert] skip', {
          pack: snapInv.packId,
          flag: ocrCfgInv.invertLightGlyphs,
        });
      }
    }

    // Final geometry dump is written after mapping (see end of this path).
    // Do not overwrite cache with a pre-lattice grid mid-pipeline.
    if (!ocr.text && !ocr.lines.length) {
      // Image may still have locked a layout — keep it for the fail path.
      const layoutId =
        imageLayout && imageLayout.layoutId !== OCR_TEXT_ONLY_FALLBACK
          ? imageLayout.layoutId
          : isAutoOcrLayout(requestedLayoutId)
            ? OCR_TEXT_ONLY_FALLBACK
            : requestedLayoutId;
      return {
        artifacts: [],
        errors: [t('sourceOcrEmpty')],
        layoutId,
        requestedLayoutId,
        matrix: null,
        imageUri: sourceImageUri,
      };
    }

    let layoutId = requestedLayoutId;
    let layoutScore: number | null = null;
    const snapEarly = getSnapshot();
    const packEarly = getPackById(snapEarly.packId);
    const ocrConfigEarly = getOcrConfigForScope(
      packEarly,
      snapEarly.groupId,
      snapEarly.areaId
    );
    const allowedLayouts = packAllowedConcreteLayouts(ocrConfigEarly);

    if (isAutoOcrLayout(requestedLayoutId)) {
      const textDet = detectOcrLayout(
        {
          text: ocr.text,
          lines: ocr.lines,
          pageWidth: ocr.pageWidth,
          pageHeight: ocr.pageHeight,
        },
        {
          dateDuty: ocrConfigEarly.dateDuty,
          layoutPriors: ocrConfigEarly.layoutPriors as
            | Partial<Record<ConcreteOcrLayoutId, number>>
            | undefined,
        }
      );
      // Zero out layouts the pack does not offer.
      for (const id of Object.keys(textDet.scores) as ConcreteOcrLayoutId[]) {
        if (!allowedLayouts.includes(id)) textDet.scores[id] = 0;
      }
      if (imageLayout) {
        for (const id of Object.keys(imageLayout.scores) as ConcreteOcrLayoutId[]) {
          if (!allowedLayouts.includes(id)) imageLayout.scores[id] = 0;
        }
      }
      let detected = mergeLayoutDetections(imageLayout, textDet);
      const uncertainty = analyzeLayoutUncertainty(detected.scores, allowedLayouts);
      layoutScore = uncertainty.bestScore;

      if (uncertainty.uncertain && opts.pickOcrLayout) {
        opts.onStatus?.({ line: t('sourceOcrStatusLayoutUncertain') });
        const options = [
          ...allowedLayouts
            .map((id) => ({ id, score: detected.scores[id] || 0 }))
            .filter((o) => o.score > 0.05 || o.id === uncertainty.bestId || o.id === uncertainty.secondId)
            .sort((a, b) => b.score - a.score)
            .slice(0, 4),
          { id: OCR_TEXT_ONLY_FALLBACK as typeof OCR_TEXT_ONLY_FALLBACK, score: 0 },
        ];
        // Ensure best + second present
        for (const id of [uncertainty.bestId, uncertainty.secondId]) {
          if (id && !options.some((o) => o.id === id)) {
            options.unshift({ id, score: detected.scores[id] || 0 });
          }
        }
        const picked = await opts.pickOcrLayout({
          options,
          suggestedId: uncertainty.bestScore >= 0.15 ? uncertainty.bestId : OCR_TEXT_ONLY_FALLBACK,
          reason: t('sourceOcrLayoutPickReason', {
            detail: uncertainty.reason,
          }),
        });
        if (!picked?.id) {
          return {
            artifacts: [],
            errors: [],
            layoutId: OCR_TEXT_ONLY_FALLBACK,
            requestedLayoutId,
            matrix: null,
            imageUri: sourceImageUri,
            layoutScore,
          };
        }
        layoutId = picked.id;
        layoutScore = detected.scores[picked.id as ConcreteOcrLayoutId] ?? layoutScore;
      } else if (uncertainty.uncertain) {
        // No picker (e.g. unit tests) — keep prior text-only when weak.
        layoutId = detected.layoutId;
      } else {
        layoutId = uncertainty.bestId;
        layoutScore = uncertainty.bestScore;
      }

      const labelKey = getOcrLayout(layoutId)?.labelKey || 'ocrLayoutRaw';
      const scorePct = layoutScore != null ? Math.round(layoutScore * 100) : null;
      opts.onStatus?.({
        line:
          scorePct != null
            ? t('sourceOcrStatusLayoutDetectedScore', {
                layout: t(labelKey as 'ocrLayoutRaw'),
                score: String(scorePct),
              })
            : t('sourceOcrStatusLayoutDetected', {
                layout: t(labelKey as 'ocrLayoutRaw'),
              }),
      });
    }

    const isMatrixLayout =
      layoutId === 'month-matrix' ||
      layoutId === 'week-strip' ||
      layoutId === 'date-duty';

    // Text-only fallback: trim OCR text — no structure parser.
    if (isOcrTextOnlyFallback(layoutId)) {
      opts.onStatus?.({ line: t('sourceOcrStatusDoneRaw') });
      return {
        artifacts: [{ kind: 'text', text: applyOcrLayoutPostprocess(layoutId, ocr.text) }],
        errors: [],
        layoutId,
        requestedLayoutId,
        selectedName: null,
        matrix: null,
        imageUri: sourceImageUri,
        layoutScore,
      };
    }

    opts.onStatus?.({
      line:
        layoutId === 'week-strip'
          ? t('sourceOcrStatusBuildingWeek')
          : layoutId === 'date-duty'
            ? t('sourceOcrStatusBuildingDateDuty')
            : t('sourceOcrStatusBuildingMatrix'),
    });
    let workingLines: OcrLine[] = ocr.lines;
    const dateDutyCfg = ocrConfigEarly.dateDuty;

    async function latticeForPage(
      imageUri: string,
      pageW: number,
      pageH: number
    ): Promise<{ hYs: number[]; vXs: number[] } | undefined> {
      if (!(pageH > 0) || !(pageW > 0)) return undefined;
      try {
        const gray = await loadGrayImageForLayout(imageUri);
        if (!gray) {
          // eslint-disable-next-line no-console
          console.log(`[cameraOcr] lattice gray=null uri=${String(imageUri || '').slice(0, 80)}`);
          return undefined;
        }
        // V-snap ROI restriction: table area only (right of name divider; between
        // header-like tokens and bottom content). One path only: if ROI is too
        // small/weak we just return empty lattice.
        const nameMaxX = inferNameMaxX(workingLines, pageW);
        let yMin = Infinity;
        let yMax = 0;
        let xMin = Infinity;
        let xMax = 0;
        for (const l of workingLines) {
          const b = l.boundingBox;
          const x0 = b?.x ?? 0;
          const x1 = x0 + (b?.width ?? 0);
          const y0 = b?.y ?? 0;
          const y1 = y0 + (b?.height ?? 0);
          xMin = Math.min(xMin, x0);
          xMax = Math.max(xMax, x1);
          const t = String(l.text || '').replace(/\s+/g, '').trim();
          const isHeaderLike =
            /^(Mo|Di|Mi|Do|Fr|Sa|So)/i.test(t) || /^\d{1,2}$/.test(t);
          if (isHeaderLike) yMin = Math.min(yMin, y0);
          yMax = Math.max(yMax, y1);
        }
        if (!Number.isFinite(yMin)) yMin = pageH * 0.1;
        if (!Number.isFinite(xMin)) xMin = nameMaxX * 0.5;
        if (!Number.isFinite(xMax) || xMax <= xMin) xMax = pageW * 0.95;
        // Table ink only — do not search V-lines out to the photo/metal frame.
        const x0p = Math.max(0, Math.min(nameMaxX * 0.85, xMin - pageW * 0.02));
        const x1p = Math.min(pageW * 0.98, xMax + pageW * 0.02);
        const y0p = Math.max(0, yMin - pageH * 0.05);
        const y1p = Math.min(pageH, yMax + pageH * 0.05);
        const roi = {
          x0: (x0p * gray.width) / pageW,
          x1: (x1p * gray.width) / pageW,
          y0: (y0p * gray.height) / pageH,
          y1: (y1p * gray.height) / pageH,
        };
        let raw = detectRuledLattice(gray, { roi });
        // One explicit window expand (same idea as thrFrac relax in detectRuledLattice):
        // a too-tight OCR-ink ROI can miss faint printed rules on phone probes.
        if (raw.hYs.length < 3 || raw.vXs.length < 6) {
          const full = detectRuledLattice(gray);
          if (
            full.hYs.length > raw.hYs.length ||
            (full.hYs.length >= 3 && full.vXs.length > raw.vXs.length)
          ) {
            raw = full;
          }
        }
        if (raw.hYs.length < 2) {
          // eslint-disable-next-line no-console
          console.log(
            `[cameraOcr] lattice empty gray=${gray.width}x${gray.height} ` +
              `roiH=${raw.hYs.length} roiV=${raw.vXs.length}`
          );
          return undefined;
        }
        // eslint-disable-next-line no-console
        console.log(
          `[cameraOcr] lattice ok gray=${gray.width}x${gray.height} ` +
            `h=${raw.hYs.length} v=${raw.vXs.length}`
        );
        return scaleLatticeToPage(raw, gray.width, gray.height, pageW, pageH);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.log(
          `[cameraOcr] lattice failed: ${e instanceof Error ? e.message : String(e)}`
        );
        return undefined;
      }
    }

    let lattice = await latticeForPage(uri, ocr.pageWidth, ocr.pageHeight || 0);
    const matrixOpts = () => (lattice?.hYs?.length ? { lattice } : undefined);

    function buildStructuredGrid(
      lines: OcrLine[],
      pageW: number,
      pageH?: number
    ): MonthMatrixGrid {
      if (layoutId === 'week-strip') return buildWeekStripGrid(lines, pageW);
      if (layoutId === 'date-duty') {
        return buildDateDutyGrid(lines, pageW, {
          pageHeight: pageH,
          dateDuty: dateDutyCfg,
        });
      }
      const rectifier =
        pageH && pageH > 0
          ? buildPerspectiveRectifier(lines, pageW, pageH, lattice || null)
          : null;
      if (!rectifier) return buildMonthMatrixGrid(lines, pageW, pageH, matrixOpts());
      const rectifiedLines = transformLinesByHomography(lines, rectifier.forward);
      const rectifiedLattice =
        lattice?.hYs?.length || lattice?.vXs?.length
          ? transformLatticeByHomography(
              { hYs: lattice?.hYs || [], vXs: lattice?.vXs || [] },
              rectifier
            )
          : undefined;
      const rectified = buildMonthMatrixGrid(
        rectifiedLines,
        pageW,
        pageH,
        rectifiedLattice?.hYs?.length ? { lattice: rectifiedLattice } : undefined
      );
      return projectGridFromRectified(rectified, rectifier);
    }

    let grid =
      buildStructuredGrid(workingLines, ocr.pageWidth, ocr.pageHeight);

    let invertCellHits: import('./ocr/invertCellOcr').InvertCellHit[] = [];

    // Light-on-dark empty cells (pack flag): shape-match short glyphs (U,/).
    {
      const snapInv = getSnapshot();
      const ocrCfgInv = getOcrConfigForScope(
        getPackById(snapInv.packId),
        snapInv.groupId,
        snapInv.areaId
      );
      if (
        ocrCfgInv.invertLightGlyphs === true &&
        grid.ok &&
        (grid.dayFrames?.length || 0) >= 3 &&
        (grid.personFrames?.length || 0) >= 1
      ) {
        opts.onStatus?.({ line: t('sourceOcrStatusInvertPass') });
        // eslint-disable-next-line no-console
        console.log('[ocr-invert] cell pass start', {
          days: grid.dayFrames?.length,
          rows: grid.personFrames?.length,
          empty: grid.rows.reduce(
            (n, r) => n + r.cells.filter((c) => !String(c || '').trim()).length,
            0
          ),
        });
        try {
          invertCellHits = await ocrEmptyCellsViaInvert(
            uri,
            grid,
            ocr.pageWidth || 1,
            ocr.pageHeight || 1,
            recognizeImageText,
            { maxCells: 200 }
          );
          // eslint-disable-next-line no-console
          console.log('[ocr-invert] cell pass done', {
            hits: invertCellHits.length,
            sample: invertCellHits
              .slice(0, 24)
              .map((h) => `${h.rowIndex}:${h.dayIndex}=${h.text}`),
          });
          if (invertCellHits.length) {
            workingLines = mergeInvertOcrLines(
              workingLines,
              invertCellHits.map((h) => h.line)
            );
            grid = applyInvertCellHitsToGrid(grid, invertCellHits);
          }
        } catch (e) {
          // eslint-disable-next-line no-console
          console.warn(
            '[ocr-invert] cell pass failed',
            e instanceof Error ? e.message : String(e)
          );
        }
      }
    }

    // Region assist when matrix/names fail (month or week).
    async function maybeAssistRegion(
      reason: 'no-names' | 'matrix-failed' | 'weak-grid'
    ): Promise<boolean> {
      if (!opts.assistOcrRegion || !sourceImageUri) return false;
      opts.onStatus?.({ line: t('sourceOcrStatusRegionAssist') });
      const assist = await opts.assistOcrRegion({ imageUri: sourceImageUri, reason });
      if (assist.action === 'skip') return false;
      if (assist.action === 'rephoto') {
        opts.onStatus?.({ line: t('sourceOcrStatusRephoto') });
        const again = await captureOcrImage(mode === 'gallery' ? 'camera' : mode);
        if (!again) return false;
        try {
          const prepared = await prepareImageForOcr(again);
          const regionOcr = await recognizeImageText(prepared);
          workingLines = [...workingLines, ...regionOcr.lines];
          const pageW = Math.max(ocr.pageWidth, regionOcr.pageWidth);
          const pageH =
            Math.max(ocr.pageHeight || 0, regionOcr.pageHeight || 0) || undefined;
          lattice = await latticeForPage(prepared, pageW, pageH || 0);
          grid = buildStructuredGrid(workingLines, pageW, pageH);
          return true;
        } catch {
          return false;
        }
      }
      if (assist.action === 'painted') {
        let pageW = ocr.pageWidth;
        let pageH = ocr.pageHeight || 0;
        // User rotated in assist → one re-OCR on the new URI (intentional path).
        if (assist.imageUri && assist.imageUri !== sourceImageUri) {
          try {
            const prepared = await prepareImageForOcr(assist.imageUri);
            const regionOcr = await recognizeImageText(prepared);
            if (!regionOcr.lines.length) return false;
            sourceImageUri = assist.imageUri;
            workingLines = regionOcr.lines;
            pageW = regionOcr.pageWidth || pageW;
            pageH = regionOcr.pageHeight || pageH;
            ocr = regionOcr;
            lattice = await latticeForPage(prepared, pageW, pageH);
          } catch {
            return false;
          }
        }

        const nameBox = assist.regions.find((r) => r.kind === 'name-column')?.box;
        const headerBox = assist.regions.find((r) => r.kind === 'day-header')?.box;
        const ownBox = assist.regions.find((r) => r.kind === 'own-row')?.box;

        // Schnellmodus: only own-row → calendar columns from month/year.
        if (ownBox && !headerBox && assist.monthYear) {
          const preferred = await loadOcrPreferredName();
          grid = buildOwnRowAssistGrid({
            lines: workingLines,
            pageWidth: pageW,
            pageHeight: pageH || Math.round(pageW * 0.75),
            ownRow: ownBox,
            nameColumn: nameBox || null,
            monthYear: assist.monthYear,
            preferredName: preferred,
          });
          return grid.ok;
        }

        workingLines = biasLinesByPaintedRegions(
          workingLines,
          assist.regions,
          pageW,
          pageH || Math.round(pageW * 0.75)
        );
        grid =
          buildStructuredGrid(workingLines, pageW, pageH || undefined);
        grid = relaxAssistGridOk(grid);

        // Name+days still weak but own-row painted + month → Schnellmodus.
        if (!grid.ok && ownBox && assist.monthYear) {
          const preferred = await loadOcrPreferredName();
          grid = buildOwnRowAssistGrid({
            lines: ocr.lines,
            pageWidth: pageW,
            pageHeight: pageH || Math.round(pageW * 0.75),
            ownRow: ownBox,
            nameColumn: nameBox || null,
            monthYear: assist.monthYear,
            preferredName: preferred,
          });
        }
        return grid.ok;
      }
      // Legacy tap: restrict name detection to an x-band around the tap.
      if (assist.action === 'tap' && assist.kind === 'name-column') {
        const band = ocr.pageWidth * 0.18;
        const cx = assist.xNorm * ocr.pageWidth;
        workingLines = ocr.lines.filter((ln) => {
          const x = (ln.boundingBox?.x || 0) + (ln.boundingBox?.width || 0) / 2;
          return Math.abs(x - cx) <= band || x < ocr.pageWidth * 0.35;
        });
        grid =
          buildStructuredGrid(workingLines, ocr.pageWidth, ocr.pageHeight);
        return true;
      }
      return false;
    }

    // Structured layouts: one path — grid names for matrix-like layouts.
    if (isMatrixLayout && !grid.ok) {
      const helped = await maybeAssistRegion('matrix-failed');
      if (!helped || !grid.ok) {
        opts.onStatus?.({ line: t('sourceOcrStatusDoneRaw') });
        return {
          ...matrixFailedResult(layoutId, ocr, sourceImageUri),
          requestedLayoutId,
          layoutScore,
        };
      }
    }

    opts.onStatus?.({ line: t('sourceOcrStatusFindingNames') });
    let candidates: OcrNameCandidate[] = [];
    if (grid.ok && grid.rows.length) {
      candidates = toCandidates(matrixRowsAsNameCandidates(grid));
    }
    if (!isMatrixLayout) {
      if (!candidates.length) {
        candidates = detectRosterNames(workingLines, ocr.pageWidth).filter((c) =>
          isPlausiblePersonName(c.label)
        );
      }
      if (!candidates.length && ocr.text) {
        candidates = detectRosterNamesFromPlainText(ocr.text).filter((c) =>
          isPlausiblePersonName(c.label)
        );
      }
    }

    if (isMatrixLayout && !candidates.length) {
      const helped = await maybeAssistRegion('no-names');
      if (helped && grid.ok) {
        candidates = toCandidates(matrixRowsAsNameCandidates(grid));
      }
      if (!candidates.length) {
        opts.onStatus?.({ line: t('sourceOcrStatusDoneRaw') });
        return {
          ...matrixFailedResult(layoutId, ocr, sourceImageUri),
          requestedLayoutId,
          layoutScore,
        };
      }
    }

    // Fail closed on wrong layout / junk names before the name picker.
    if (isMatrixLayout && grid.ok) {
      const early = assessMatrixUsability(grid, {
        layoutId,
        lines: workingLines,
        pageWidth: ocr.pageWidth,
        pageHeight: ocr.pageHeight,
        deferFillCheck: true,
      });
      if (!early.usable) {
        // One-shot: pack has date×duty and cues say so, but we built month-matrix.
        // Not a retry — correct layout once, then continue or fail.
        const snapFix = getSnapshot();
        const packFix = getPackById(snapFix.packId);
        const ocrCfgFix = getOcrConfigForScope(
          packFix,
          snapFix.groupId,
          snapFix.areaId
        );
        if (
          early.reason === 'layout-mismatch' &&
          layoutId !== 'date-duty' &&
          !!ocrCfgFix.dateDuty?.columns?.length &&
          allowedLayouts.includes('date-duty')
        ) {
          layoutId = 'date-duty';
          opts.onStatus?.({ line: t('sourceOcrStatusBuildingDateDuty') });
          grid = buildStructuredGrid(workingLines, ocr.pageWidth, ocr.pageHeight);
          if (grid.ok) {
            candidates = toCandidates(matrixRowsAsNameCandidates(grid));
            const again = assessMatrixUsability(grid, {
              layoutId,
              lines: workingLines,
              pageWidth: ocr.pageWidth,
              pageHeight: ocr.pageHeight,
              deferFillCheck: true,
            });
            if (again.usable) {
              // continue with date-duty grid
            } else {
              opts.onStatus?.({ line: t('sourceOcrStatusDoneRaw') });
              return {
                ...matrixFailedResult(layoutId, ocr, sourceImageUri, again.reason),
                requestedLayoutId,
                layoutScore,
              };
            }
          } else {
            opts.onStatus?.({ line: t('sourceOcrStatusDoneRaw') });
            return {
              ...matrixFailedResult(layoutId, ocr, sourceImageUri, early.reason),
              requestedLayoutId,
              layoutScore,
            };
          }
        } else {
          opts.onStatus?.({ line: t('sourceOcrStatusDoneRaw') });
          return {
            ...matrixFailedResult(layoutId, ocr, sourceImageUri, early.reason),
            requestedLayoutId,
            layoutScore,
          };
        }
      }
    }

    const preferred = await loadOcrPreferredName();
    const aliases = await loadOcrNameAliases();
    // Apply saved spelling (Settings + prior OCR typo fixes) onto candidates.
    const rawCandidates = candidates;
    candidates = applySavedNameSpellings(candidates, preferred, aliases);
    const matched = matchPreferredName(preferred, rawCandidates, aliases);

    let selected: OcrNameCandidate | null = null;

    // Settings name fuzzy-matches OCR (incl. typos) → use your spelling, skip picker.
    if (
      preferred &&
      matched &&
      matched.score >= OCR_AUTO_NAME_MIN_SCORE &&
      candidates.length
    ) {
      const ocrLabel = matched.candidate.label;
      selected = {
        ...matched.candidate,
        label: preferred,
      };
      await rememberOcrNameAlias(ocrLabel, preferred);
      opts.onStatus?.({ line: t('sourceOcrStatusAutoName', { name: preferred }) });
    } else if (candidates.length && opts.pickRosterName) {
      opts.onStatus?.({ line: t('sourceOcrStatusPickName') });
      const suggested =
        matched && matched.score >= 0.8
          ? candidates.find((c) => c.id === matched.candidate.id) || matched.candidate
          : null;
      const picked = await opts.pickRosterName({
        candidates,
        suggestedId: suggested?.id || null,
        preferredLabel: preferred,
      });
      if (picked?.id) {
        const baseRaw = rawCandidates.find((c) => c.id === picked.id) || null;
        const base = candidates.find((c) => c.id === picked.id) || baseRaw;
        if (!base) {
          return {
            artifacts: [],
            errors: [t('sourceOcrNameMissing')],
            layoutId,
            requestedLayoutId,
            matrix: grid.ok ? grid : null,
            imageUri: sourceImageUri,
          };
        }
        const ocrLabel = baseRaw?.label || base.label;
        const label = resolveConfirmedRosterLabel({
          preferred,
          ocrLabel,
          pickedLabel: picked.label,
        });
        selected = { ...base, label };
        if (ocrLabel && ocrLabel !== label) {
          await rememberOcrNameAlias(ocrLabel, label);
        }
      } else if (!isMatrixLayout || !grid.ok) {
        return {
          artifacts: [],
          errors: [],
          layoutId,
          requestedLayoutId,
          matrix: null,
          imageUri: sourceImageUri,
        };
      }
    } else if (candidates.length === 1) {
      selected = candidates[0];
    }

    let rawText: string;
    let selectedName: string | null = null;
    let outGrid = grid;

    if (grid.ok) {
      // Pack OCR JSON → shared engine; codes/times from mapping JSON.
      const snap = getSnapshot();
      const pack = getPackById(snap.packId);
      const ocrConfig = getOcrConfigForScope(pack, snap.groupId, snap.areaId);
      const ocrEngine = getOcrEngine(getOcrEngineIdForPack(pack));
      const packMapping = getMappingForScope(snap.packId, snap.groupId, snap.areaId);
      const presetMap = packMapping?.presets?.[snap.preset] ?? null;
      const useMapping = ocrConfig.usePackMapping !== false;
      outGrid = useMapping
        ? ocrEngine.mapGrid(
            outGrid,
            presetMap,
            packMapping?.colors,
            packMapping?.codeAliases
          )
        : outGrid;
      // Intensify every row once (same refine path — needed for full-matrix accuracy).
      if (useMapping) {
        outGrid = ocrEngine.refineAllPersonRowsFromOcr(
          outGrid,
          workingLines,
          presetMap,
          packMapping?.colors,
          undefined,
          packMapping?.codeAliases
        );
      }
      // Short-glyph vacation / free-day: one ordered finalize after refine.
      if (invertCellHits.length) {
        outGrid = finalizeShortGlyphVacation({
          grid: outGrid,
          glyphHits: invertCellHits,
          lines: workingLines,
          vacationCode: 'U',
        });
        if (useMapping) {
          outGrid = ocrEngine.mapGrid(
            outGrid,
            presetMap,
            packMapping?.colors,
            packMapping?.codeAliases
          );
        }
      }
      outGrid = {
        ...outGrid,
        rows: applyKnownSpellingsToGridRows(outGrid.rows, preferred, aliases),
      };

      // Always rewrite fuzzy/alias hits to Settings spelling on the visible table.
      if (preferred) {
        const hit = matchPreferredName(preferred, rawCandidates, aliases);
        if (hit && hit.score >= 0.8) {
          const ocrKey = hit.candidate.id;
          outGrid = {
            ...outGrid,
            rows: outGrid.rows.map((r) =>
              normalizeNameKeyPublic(r.name) === ocrKey || r.name === hit.candidate.label
                ? { ...r, name: preferred }
                : r
            ),
          };
        }
      }

      if (selected) {
        selectedName = selected.label;
        const ocrKey = selected.id;
        outGrid = {
          ...outGrid,
          rows: outGrid.rows.map((r) =>
            normalizeNameKeyPublic(r.name) === ocrKey ||
            normalizeNameKeyPublic(r.name) === normalizeNameKeyPublic(selected.label)
              ? { ...r, name: selected.label }
              : r
          ),
        };
        // Known row + pack: re-scoop that line (Kürzel und/oder Zeiten) with pack oracle.
        if (useMapping) {
          outGrid = ocrEngine.refinePersonRowFromOcr(
            outGrid,
            selected.label,
            workingLines,
            presetMap,
            packMapping?.colors,
            packMapping?.codeAliases
          );
          if (invertCellHits.length) {
            outGrid = finalizeShortGlyphVacation({
              grid: outGrid,
              glyphHits: invertCellHits,
              lines: workingLines,
              vacationCode: 'U',
            });
            outGrid = ocrEngine.mapGrid(
              outGrid,
              presetMap,
              packMapping?.colors,
              packMapping?.codeAliases
            );
          }
        }
      } else if (preferred && useMapping) {
        // Preferred name known without picker: still intensify that row.
        outGrid = ocrEngine.refinePersonRowFromOcr(
          outGrid,
          preferred,
          workingLines,
          presetMap,
          packMapping?.colors,
          packMapping?.codeAliases
        );
      }

      // After refine/glyph finalize: refuse near-empty / junk tables (no review UI).
      const late = assessMatrixUsability(outGrid, {
        layoutId,
        lines: workingLines,
        pageWidth: ocr.pageWidth,
        pageHeight: ocr.pageHeight,
      });
      if (!late.usable) {
        opts.onStatus?.({ line: t('sourceOcrStatusDoneRaw') });
        return {
          ...matrixFailedResult(layoutId, ocr, sourceImageUri, late.reason),
          requestedLayoutId,
          layoutScore,
        };
      }

      if (selected) {
        await saveOcrPreferredName(selected.label);
        const titleMine =
          layoutId === 'date-duty'
            ? t('sourceOcrMatrixTitleDateDuty', {
                name: selected.label,
                people: outGrid.rows.length,
              })
            : t('sourceOcrMatrixTitleMine', {
                name: selected.label,
                people: outGrid.rows.length,
              });
        rawText = formatMonthMatrixTable(outGrid, {
          title: titleMine,
          matchedName: selected.label,
        });
        const metrics = computeMonthMatrixMetrics(outGrid);
        const doneLine = t('sourceOcrStatusDoneMatrixNamed', {
          name: selected.label,
          rows: metrics.rowCount,
          days: metrics.dayCoverage || metrics.headerCount,
        });
        opts.onStatus?.({
          line:
            metrics.dayCoverage < 20
              ? `${doneLine} — ${t('sourceOcrMatrixWeakHint')}`
              : doneLine,
        });
      } else {
        rawText = formatMonthMatrixTable(outGrid, {
          title:
            layoutId === 'date-duty'
              ? t('sourceOcrMatrixTitleDateDutyAll')
              : t('sourceOcrMatrixTitleAll'),
        });
        const metrics = computeMonthMatrixMetrics(outGrid);
        const doneLine = t('sourceOcrStatusDoneMatrix', {
          rows: metrics.rowCount,
          days: metrics.dayCoverage || metrics.headerCount,
        });
        opts.onStatus?.({
          line:
            metrics.dayCoverage < 20
              ? `${doneLine} — ${t('sourceOcrMatrixWeakHint')}`
              : doneLine,
        });
      }
    } else {
      rawText = [t('sourceOcrMatrixFailedTitle'), '', t('sourceOcrMatrixFailedHint')].join('\n');
      opts.onStatus?.({ line: t('sourceOcrStatusDoneRaw') });
    }

    const processed = applyOcrLayoutPostprocess(layoutId, rawText);
    const metrics = outGrid.ok ? computeMonthMatrixMetrics(outGrid) : null;
    let regionSnapshots: OcrRegionSnapshot[] | null = null;
    // Always prefer full image size (set on ocr after recognize) over text-bbox max.
    const pageW = ocr.pageWidth || 1;
    const pageH = ocr.pageHeight || 1;
    if (outGrid.ok && metrics && metrics.dayCoverage >= 5 && metrics.rowCount >= 2) {
      opts.onStatus?.({ line: t('sourceOcrStatusSnapshots') });
      try {
        regionSnapshots = await captureAutoSnapshots({
          imageUri: uri,
          grid: outGrid,
          pageWidth: pageW,
          pageHeight: pageH,
          matchedName: selectedName || preferred || null,
        });
      } catch {
        regionSnapshots = null;
      }
    }
    // Final dump includes live lattice + frames (early dump lacks V/H lattice).
    try {
      await persistOcrGeometryDump(ocr, {
        lattice: lattice || null,
        grid: outGrid.ok ? outGrid : null,
      });
    } catch {
      // dump is best-effort
    }

    return {
      artifacts: [{ kind: 'text', text: processed }],
      errors: [],
      layoutId,
      requestedLayoutId,
      selectedName,
      matrix: outGrid.ok ? outGrid : null,
      matrixMetrics: metrics,
      imageUri: sourceImageUri,
      regionSnapshots,
      layoutScore,
      pageWidth: pageW,
      pageHeight: pageH,
    };
  } catch (e) {
    const code = e instanceof Error ? e.message : String(e);
    if (code === 'OCR_NATIVE_MISSING') throw new Error(t('sourceOcrNativeMissing'));
    if (code === 'OCR_UNSUPPORTED') throw new Error(t('sourceOcrUnsupported'));
    throw e instanceof Error ? e : new Error(String(e));
  }
}

export const cameraOcrSource: Source = {
  id: 'camera-ocr',
  kind: 'local',
  needsCredentials: false,
  needsWebView: false,
  labelKey: 'sourceCameraOcr',
  async run(opts: SourceRunOpts): Promise<SourceRunResult> {
    const r = await runCameraOcr(opts as CameraOcrRunOpts);
    return { artifacts: r.artifacts, errors: r.errors };
  },
};
