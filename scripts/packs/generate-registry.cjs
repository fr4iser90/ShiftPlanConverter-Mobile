#!/usr/bin/env node
/**
 * Scan src/packs/builtin/<packId>/config.json and emit registry.generated.ts
 * with static Metro-friendly imports. Add a pack folder, re-run, done.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const BUILTIN = path.join(ROOT, 'src/packs/builtin');
const OUT = path.join(ROOT, 'src/packs/registry.generated.ts');

function die(msg) {
  console.error(`[packs:generate] ${msg}`);
  process.exit(1);
}

function toIdent(...parts) {
  const s = parts.join('_').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return (/^[A-Za-z_]/.test(s) ? s : `_${s}`) || 'x';
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    die(`failed to read ${file}: ${e.message}`);
  }
}

function exists(p) {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function collectAreaRefs(areas) {
  const out = [];
  for (const area of areas || []) {
    if (area && area.expand) {
      const e = area.expand;
      const from = e.from;
      const to = e.to;
      if (!Number.isInteger(from) || !Number.isInteger(to) || to < from) {
        die(`invalid expand range ${from}..${to}`);
      }
      for (let n = from; n <= to; n++) {
        const ovr = (e.overrides && e.overrides[String(n)]) || {};
        out.push({
          id: ovr.id || String(e.id).split('{n}').join(String(n)),
          mapping: ovr.mapping || e.mapping,
          payroll: ovr.payroll || e.payroll,
          ocr: ovr.ocr || e.ocr,
        });
      }
      continue;
    }
    out.push(area);
  }
  return out;
}

const packDirs = fs
  .readdirSync(BUILTIN)
  .filter((name) => {
    const full = path.join(BUILTIN, name);
    return fs.statSync(full).isDirectory() && exists(path.join(full, 'config.json'));
  })
  .sort();

if (!packDirs.length) die(`no packs with config.json under ${BUILTIN}`);

const imports = [];
const packBlocks = [];
let smokeDefaultId = null;

for (const packId of packDirs) {
  const packRoot = path.join(BUILTIN, packId);
  const config = readJson(path.join(packRoot, 'config.json'));
  const configIdent = toIdent('config', packId);
  imports.push(`import ${configIdent} from './builtin/${packId}/config.json';`);

  const ocrRel = 'parsers/ocr.json';
  const pdfRel = 'parsers/pdf.json';
  if (!exists(path.join(packRoot, ocrRel))) die(`${packId}: missing ${ocrRel}`);
  if (!exists(path.join(packRoot, pdfRel))) die(`${packId}: missing ${pdfRel}`);

  const ocrIdent = toIdent('ocr', packId);
  const pdfIdent = toIdent('pdf', packId);
  imports.push(`import ${ocrIdent} from './builtin/${packId}/${ocrRel}';`);
  imports.push(`import ${pdfIdent} from './builtin/${packId}/${pdfRel}';`);

  if (config.isSmokeDefault) {
    if (smokeDefaultId) die(`multiple isSmokeDefault packs: ${smokeDefaultId}, ${packId}`);
    smokeDefaultId = packId;
    const sw = config.smokeWorkplace;
    if (!sw?.groupId || !sw?.areaId || !sw?.preset) {
      die(`${packId}: isSmokeDefault requires smokeWorkplace.{groupId,areaId,preset}`);
    }
  }

  const mappingPaths = new Map();
  const payrollPaths = new Map();
  const ocrProfilePaths = new Map();

  for (const group of config.groups || []) {
    for (const area of collectAreaRefs(group.areas)) {
      const mappingRel = String(area.mapping || '').trim();
      if (!mappingRel) die(`${packId}: area ${group.id}/${area.id} missing mapping`);
      const mappingAbs = path.join(packRoot, mappingRel);
      if (!mappingPaths.has(mappingRel)) {
        if (!exists(mappingAbs)) {
          die(`${packId}: mapping not found: ${mappingRel}`);
        }
        const ident = toIdent('map', packId, mappingRel);
        mappingPaths.set(mappingRel, ident);
        imports.push(`import ${ident} from './builtin/${packId}/${mappingRel}';`);
      }
      const mappingJson = readJson(mappingAbs);
      // Role file may declare ocr / payroll (preferred over legacy config fields).
      const payRel = String(
        mappingJson.payroll?.profile || area.payroll?.profile || ''
      ).trim();
      if (payRel && !payrollPaths.has(payRel)) {
        if (!exists(path.join(packRoot, payRel))) {
          die(`${packId}: payroll profile not found: ${payRel}`);
        }
        const ident = toIdent('pay', packId, payRel);
        payrollPaths.set(payRel, ident);
        imports.push(`import ${ident} from './builtin/${packId}/${payRel}';`);
      }
      const ocrProf = String(mappingJson.ocr || area.ocr?.profile || '').trim();
      if (ocrProf && !ocrProfilePaths.has(ocrProf)) {
        if (!exists(path.join(packRoot, ocrProf))) {
          die(`${packId}: OCR profile not found: ${ocrProf}`);
        }
        const ident = toIdent('ocrp', packId, ocrProf);
        ocrProfilePaths.set(ocrProf, ident);
        imports.push(`import ${ident} from './builtin/${packId}/${ocrProf}';`);
      }
    }
  }

  const mapEntries = [...mappingPaths.entries()]
    .map(([rel, ident]) => `    ${JSON.stringify(rel)}: ${ident} as PackMapping,`)
    .join('\n');
  const payEntries = [...payrollPaths.entries()]
    .map(([rel, ident]) => `    ${JSON.stringify(rel)}: ${ident} as PayrollProfile,`)
    .join('\n');
  const ocrpEntries = [...ocrProfilePaths.entries()]
    .map(([rel, ident]) => `    ${JSON.stringify(rel)}: ${ident} as PackOcrScopeConfig,`)
    .join('\n');

  packBlocks.push(`  {
    id: ${JSON.stringify(packId)},
    config: ${configIdent} as PackConfigJson,
    ocr: ${ocrIdent} as PackOcrConfig,
    pdf: ${pdfIdent} as PackPdfConfig,
    mappingsByPath: {
${mapEntries}
    },
    payrollByPath: {
${payEntries}
    },
    ocrByPath: {
${ocrpEntries}
    },
  }`);
}

if (!smokeDefaultId) {
  console.warn(
    '[packs:generate] warning: no pack with isSmokeDefault — smoke constants fall back to first pack'
  );
}

const smokeLit = smokeDefaultId ? JSON.stringify(smokeDefaultId) : 'null';

const body = `/* AUTO-GENERATED by scripts/packs/generate-registry.cjs — do not edit */
import type { PackMapping } from '../convert/types';
import type { PayrollProfile } from '../payroll/types';
import type { PackPdfConfig } from '../convert/parsers/engines';
import type { PackOcrConfig, PackOcrScopeConfig, PackConfigJson } from './types';

${imports.join('\n')}

export type PackRegistryEntry = {
  id: string;
  config: PackConfigJson;
  ocr: PackOcrConfig;
  pdf: PackPdfConfig;
  mappingsByPath: Record<string, PackMapping>;
  payrollByPath: Record<string, PayrollProfile>;
  ocrByPath: Record<string, PackOcrScopeConfig>;
};

export const PACK_REGISTRY: PackRegistryEntry[] = [
${packBlocks.join(',\n')}
];

export const SMOKE_DEFAULT_PACK_ID: string | null = ${smokeLit};
`;

fs.writeFileSync(OUT, body);
console.log(`[packs:generate] wrote ${path.relative(ROOT, OUT)} (${packDirs.length} packs)`);
