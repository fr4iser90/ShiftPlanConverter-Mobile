/**
 * Capture → OCR → month-matrix grid → name pick → full matrix text for review.
 * Does not ingest. See docs/dev/ocr-camera-source.md.
 */
import { t } from '../i18n';
import { getOcrEngine } from '../convert/parsers/ocr';
import { getMappingForScope, getPackById, getOcrEngineIdForPack, getOcrConfigForPack } from '../packs';
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
import { maybeDumpOcrGeometry } from './ocr/geometryDump';
import {
  applyOcrLayoutPostprocess,
  DEFAULT_OCR_LAYOUT_ID,
  getOcrLayout,
  isAutoOcrLayout,
  isOcrTextOnlyFallback,
  OCR_TEXT_ONLY_FALLBACK,
  type OcrLayoutId,
} from './ocr/layouts';
import { detectLayoutFromImageUri } from './ocr/layouts/detectFromImage';
import { detectOcrLayout, mergeLayoutDetections } from './ocr/detectLayout';
import { analyzeLayoutUncertainty } from './ocr/layoutUncertainty';
import { packAllowedConcreteLayouts } from './ocr/packLayouts';
import { captureAutoSnapshots, type OcrRegionSnapshot } from './ocr/regionSnapshots';
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
  buildMonthMatrixGrid,
  computeMonthMatrixMetrics,
  formatMonthMatrixTable,
  matrixRowsAsNameCandidates,
  type MonthMatrixGrid,
  type MonthMatrixMetrics,
} from './ocr/monthMatrix';
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
  /** Name/date unclear — tap region or rephotograph. */
  assistOcrRegion?: (req: OcrRegionAssistRequest) => Promise<OcrRegionAssistResult>;
  autoSelectPreferred?: boolean;
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

function matrixFailedResult(
  layoutId: string,
  ocr?: { text: string; lines: unknown[] },
  imageUri?: string | null
): CameraOcrRunResult {
  const lines = [
    t('sourceOcrMatrixFailedTitle'),
    '',
    ocr && !ocr.lines.length && ocr.text
      ? t('sourceOcrMatrixFailedNoBoxes', {
          chars: ocr.text.length,
          lines: ocr.lines.length,
        })
      : t('sourceOcrMatrixFailedHint'),
  ];
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

  const sourceImageUri = captured;
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
    const ocr = await recognizeImageText(uri);
    maybeDumpOcrGeometry(ocr);
    // Persist for adb pull / e2e. Always in __DEV__; release only with explicit flag.
    const dumpEnv =
      typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_OCR_DUMP_GEOMETRY === '1';
    // eslint-disable-next-line no-undef
    const isDev = typeof __DEV__ !== 'undefined' && __DEV__;
    if (dumpEnv || isDev) {
      try {
        await persistOcrGeometryDump(ocr);
      } catch {
        // dump is best-effort
      }
    }
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
    const packEarly = getPackById(snapEarly.hospitalId);
    const ocrConfigEarly = getOcrConfigForPack(packEarly);
    const allowedLayouts = packAllowedConcreteLayouts(ocrConfigEarly);

    if (isAutoOcrLayout(requestedLayoutId)) {
      const textDet = detectOcrLayout({
        text: ocr.text,
        lines: ocr.lines,
        pageWidth: ocr.pageWidth,
      });
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

    const isMatrixLayout = layoutId === 'month-matrix' || layoutId === 'week-strip';

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
          : t('sourceOcrStatusBuildingMatrix'),
    });
    let workingLines: OcrLine[] = ocr.lines;
    let grid =
      layoutId === 'week-strip'
        ? buildWeekStripGrid(workingLines, ocr.pageWidth)
        : buildMonthMatrixGrid(workingLines, ocr.pageWidth);

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
          grid =
            layoutId === 'week-strip'
              ? buildWeekStripGrid(workingLines, Math.max(ocr.pageWidth, regionOcr.pageWidth))
              : buildMonthMatrixGrid(workingLines, Math.max(ocr.pageWidth, regionOcr.pageWidth));
          return true;
        } catch {
          return false;
        }
      }
      // Tap: restrict name detection to an x-band around the tap.
      if (assist.kind === 'name-column') {
        const band = ocr.pageWidth * 0.18;
        const cx = assist.xNorm * ocr.pageWidth;
        workingLines = ocr.lines.filter((ln) => {
          const x = (ln.boundingBox?.x || 0) + (ln.boundingBox?.width || 0) / 2;
          return Math.abs(x - cx) <= band || x < ocr.pageWidth * 0.35;
        });
        grid =
          layoutId === 'week-strip'
            ? buildWeekStripGrid(workingLines, ocr.pageWidth)
            : buildMonthMatrixGrid(workingLines, ocr.pageWidth);
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
      const pack = getPackById(snap.hospitalId);
      const ocrConfig = getOcrConfigForPack(pack);
      const ocrEngine = getOcrEngine(getOcrEngineIdForPack(pack));
      const packMapping = getMappingForScope(snap.hospitalId, snap.groupId, snap.areaId);
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
        }
        await saveOcrPreferredName(selected.label);
        rawText = formatMonthMatrixTable(outGrid, {
          title: t('sourceOcrMatrixTitleMine', {
            name: selected.label,
            people: outGrid.rows.length,
          }),
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
        // Preferred name known without picker: still intensify that row.
        if (preferred && useMapping) {
          outGrid = ocrEngine.refinePersonRowFromOcr(
            outGrid,
            preferred,
            workingLines,
            presetMap,
            packMapping?.colors,
            packMapping?.codeAliases
          );
        }
        rawText = formatMonthMatrixTable(outGrid, {
          title: t('sourceOcrMatrixTitleAll'),
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
    const pageH = Math.max(
      ...workingLines.map((ln) => (ln.boundingBox?.y || 0) + (ln.boundingBox?.height || 0)),
      ocr.pageWidth * 0.7
    );
    if (outGrid.ok && metrics && metrics.dayCoverage >= 5 && metrics.rowCount >= 2) {
      opts.onStatus?.({ line: t('sourceOcrStatusSnapshots') });
      try {
        regionSnapshots = await captureAutoSnapshots({
          imageUri: uri,
          grid: outGrid,
          pageWidth: ocr.pageWidth || 1,
          pageHeight: pageH || 1,
        });
      } catch {
        regionSnapshots = null;
      }
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
      pageWidth: ocr.pageWidth || null,
      pageHeight: pageH || null,
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
