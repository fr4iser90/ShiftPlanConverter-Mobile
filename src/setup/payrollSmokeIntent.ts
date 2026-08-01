/**
 * __DEV__ phone smoke: import local Verdienstnachweis PDFs already pushed into
 * document/payslip-smoke/, then open Prüfung tab.
 * shiftplan://payroll-smoke
 */
import * as Linking from 'expo-linking';

import { importPayslipSmokeDir } from '../payroll/importPayslip';
import { setWorkplace, getSnapshot } from '../state/store';
import { setMatrixStatus } from './smokeFetchIntent';
import { isSmokeCredentialSeedAllowed } from './smokeSeed';

export function isPayrollSmokeUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return /payroll-smoke/i.test(url);
}

export async function applyPayrollSmokeFromUrl(url: string): Promise<{
  imported: number;
  errors: string[];
}> {
  if (!isPayrollSmokeUrl(url)) {
    return { imported: 0, errors: ['not payroll-smoke'] };
  }
  if (!isSmokeCredentialSeedAllowed()) {
    throw new Error('payroll-smoke disabled in release builds');
  }

  // Ensure Pflege OP so Prüfung tab + profile match the VNs.
  const snap = getSnapshot();
  if (snap.groupId !== 'pflege' || snap.areaId !== 'op-ata') {
    await setWorkplace({
      packId: snap.packId || 'st-elisabeth-leipzig',
      groupId: 'pflege',
      areaId: 'op-ata',
      preset: snap.preset || 'Anästhesie',
    });
  }

  const { imported, errors } = await importPayslipSmokeDir();
  const months = imported.map((d) => d.payMonth).join(',');
  const line =
    errors.length && !imported.length
      ? `PAYROLL_SMOKE_FAIL ${errors.slice(0, 3).join(' | ')}`
      : `PAYROLL_SMOKE_OK count=${imported.length} months=${months}` +
        (errors.length ? ` errors=${errors.length}` : '');
  await setMatrixStatus(line);
  // eslint-disable-next-line no-console
  console.warn(line, errors);
  return { imported: imported.length, errors };
}
