import type { PackAreaPayroll } from '../payroll/types';

/** Area OCR extras (layouts / dateDuty) — path under pack, like payroll.profile. */
export type PackAreaOcr = {
  profile: string;
};

export type PackArea = {
  id: string;
  /** Summary fallback; overwritten from mapping `department` · `role` when present. */
  label: string;
  /** From role mapping JSON (`department`) — not pack config. */
  department?: string;
  /** From role mapping JSON (`role`) — not pack config. */
  role?: string;
  mapping: string;
  supported: boolean;
  /**
   * Duty-table id stored on the workplace (`preset` field).
   * Flat role files use `default`; derived from mapping at pack load.
   */
  /** Key of the duty-code table (`default` when mapping uses flat `dutyCodes`). */
  defaultDutyTable?: string;
  /** From role mapping `ocr` path — optional OCR scope file. */
  ocr?: PackAreaOcr;
  /** From role mapping `payroll` — optional Abrechnungsprüfer. */
  payroll?: PackAreaPayroll;
};

/** One concrete area or a numbered series expanded at load/generate time. */
export type PackAreaEntry = PackArea | PackAreaSeries;

export type PackAreaSeries = {
  expand: {
    /** Template with `{n}` — e.g. `station-{n}` */
    id: string;
    /** Template with `{n}` — e.g. `Station {n}` */
    label: string;
    from: number;
    to: number;
    mapping: string;
    supported: boolean;
    ocr?: PackAreaOcr;
    payroll?: PackAreaPayroll;
    /** Per-index overrides (`"16": { label, mapping, … }`). */
    overrides?: Record<string, Partial<PackArea>>;
  };
};

export function isPackAreaSeries(entry: PackAreaEntry): entry is PackAreaSeries {
  return !!entry && typeof entry === 'object' && 'expand' in entry;
}

function applyTemplate(tpl: string, n: number): string {
  return tpl.split('{n}').join(String(n));
}

/** Expand `expand` series into concrete areas; pass-through for normal areas. */
export function expandPackAreas(entries: PackAreaEntry[]): PackArea[] {
  const out: PackArea[] = [];
  for (const entry of entries) {
    if (!isPackAreaSeries(entry)) {
      out.push(entry);
      continue;
    }
    const e = entry.expand;
    if (!Number.isInteger(e.from) || !Number.isInteger(e.to) || e.to < e.from) {
      throw new Error(`invalid expand range ${e.from}..${e.to}`);
    }
    if (!e.id.includes('{n}') || !e.label.includes('{n}')) {
      throw new Error('expand.id and expand.label must contain {n}');
    }
    for (let n = e.from; n <= e.to; n++) {
      const ovr = e.overrides?.[String(n)] || {};
      out.push({
        id: ovr.id || applyTemplate(e.id, n),
        label: ovr.label || applyTemplate(e.label, n),
        mapping: ovr.mapping || e.mapping,
        supported: ovr.supported ?? e.supported,
        ocr: ovr.ocr ?? e.ocr,
        payroll: ovr.payroll ?? e.payroll,
      });
    }
  }
  return out;
}
