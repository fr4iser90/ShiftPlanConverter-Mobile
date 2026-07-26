/**
 * Capture → OCR → month-matrix grid → name pick → full matrix text for review.
 * Does not ingest. See docs/dev/ocr-camera-source.md.
 */
import { t } from '../i18n';
import { getMappingForScope } from '../packs';
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
import { applyPackMappingToGrid, refinePersonRowFromOcr } from './ocr/applyPackMapping';
import {
  applyOcrLayoutPostprocess,
  DEFAULT_OCR_LAYOUT_ID,
  getOcrLayout,
  isAutoOcrLayout,
  type OcrLayoutId,
} from './ocr/layouts';
import { detectOcrLayout } from './ocr/detectLayout';
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
import { isOcrNativeAvailable, recognizeImageText } from './ocr/recognize';
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
  autoSelectPreferred?: boolean;
};

export type CameraOcrRunResult = SourceRunResult & {
  /** Concrete layout used for this run (never `auto`). */
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
      layoutId: isAutoOcrLayout(requestedLayoutId) ? 'raw-review' : requestedLayoutId,
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
        layoutId: isAutoOcrLayout(requestedLayoutId) ? 'raw-review' : requestedLayoutId,
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
      return {
        artifacts: [],
        errors: [t('sourceOcrEmpty')],
        layoutId: isAutoOcrLayout(requestedLayoutId) ? 'raw-review' : requestedLayoutId,
        requestedLayoutId,
        matrix: null,
        imageUri: sourceImageUri,
      };
    }

    let layoutId = requestedLayoutId;
    if (isAutoOcrLayout(requestedLayoutId)) {
      opts.onStatus?.({ line: t('sourceOcrStatusDetectLayout') });
      const detected = detectOcrLayout({
        text: ocr.text,
        lines: ocr.lines,
        pageWidth: ocr.pageWidth,
      });
      layoutId = detected.layoutId;
      const labelKey = getOcrLayout(layoutId)?.labelKey || 'ocrLayoutRaw';
      opts.onStatus?.({
        line: t('sourceOcrStatusLayoutDetected', {
          layout: t(labelKey as 'ocrLayoutRaw'),
        }),
      });
    }

    const isMonthMatrix = layoutId === 'month-matrix';

    opts.onStatus?.({ line: t('sourceOcrStatusBuildingMatrix') });
    const grid = buildMonthMatrixGrid(ocr.lines, ocr.pageWidth);

    // month-matrix: one path — grid names only; never plain-text junk picker.
    if (isMonthMatrix && !grid.ok) {
      opts.onStatus?.({ line: t('sourceOcrStatusDoneRaw') });
      return {
        ...matrixFailedResult(layoutId, ocr, sourceImageUri),
        requestedLayoutId,
      };
    }

    opts.onStatus?.({ line: t('sourceOcrStatusFindingNames') });
    let candidates: OcrNameCandidate[] = [];
    if (grid.ok && grid.rows.length) {
      candidates = toCandidates(matrixRowsAsNameCandidates(grid));
    }
    if (!isMonthMatrix) {
      if (!candidates.length) {
        candidates = detectRosterNames(ocr.lines, ocr.pageWidth).filter((c) =>
          isPlausiblePersonName(c.label)
        );
      }
      if (!candidates.length && ocr.text) {
        candidates = detectRosterNamesFromPlainText(ocr.text).filter((c) =>
          isPlausiblePersonName(c.label)
        );
      }
    }

    if (isMonthMatrix && !candidates.length) {
      opts.onStatus?.({ line: t('sourceOcrStatusDoneRaw') });
      return {
        ...matrixFailedResult(layoutId, ocr, sourceImageUri),
        requestedLayoutId,
      };
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
      } else if (!isMonthMatrix || !grid.ok) {
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
      // Pack mapping: one path (time→code / known codes). No second layout guess.
      const snap = getSnapshot();
      const hospitalMapping = getMappingForScope(
        snap.hospitalId,
        snap.groupId,
        snap.areaId
      );
      const presetMap = hospitalMapping?.presets?.[snap.preset] ?? null;
      outGrid = applyPackMappingToGrid(outGrid, presetMap, hospitalMapping?.colors);
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
        outGrid = refinePersonRowFromOcr(
          outGrid,
          selected.label,
          ocr.lines,
          presetMap,
          hospitalMapping?.colors
        );
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
        if (preferred) {
          outGrid = refinePersonRowFromOcr(
            outGrid,
            preferred,
            ocr.lines,
            presetMap,
            hospitalMapping?.colors
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
    return {
      artifacts: [{ kind: 'text', text: processed }],
      errors: [],
      layoutId,
      requestedLayoutId,
      selectedName,
      matrix: outGrid.ok ? outGrid : null,
      matrixMetrics: metrics,
      imageUri: sourceImageUri,
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
