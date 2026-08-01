/**
 * Step: Monat wählen — postcondition = picker shows MM/YYYY (not full day-grid).
 * Day-grid verify belongs in assertContentReady (Grid-Aktualisierung).
 */
import { t } from '@/src/i18n';
import {
  type Ctx,
  status,
  run,
  softProbe,
  timed,
  gate,
  waitOpts,
  waitForCondition,
  T,
} from '../jobContext';

export async function selectMonthVerified(ctx: Ctx, month: number, year: number): Promise<void> {
  const label = `${String(month).padStart(2, '0')}/${year}`;
  const mm = String(month).padStart(2, '0');
  const yearStr = String(year);
  await timed(ctx, `select-month-${label}`, async () => {
    status(ctx, t('fjSelectMonth', { label }));
    status(ctx, t('fjStepAction', { step: `selectMonth ${label}` }));
    const sel = await run(ctx, { type: 'selectMonth', month, year }, T.selectMonth);
    if (!sel.ok && !sel.selected) {
      throw new Error(sel.error || t('fjSelectMonthFailed', { label }));
    }

    await waitForCondition(async () => {
      const ps = await softProbe(ctx, { type: 'getPickerState' }, T.softProbeShort, true);
      if (ps.pickerFound && ps.month === mm && ps.year === yearStr) return ps;
      return null;
    }, waitOpts(ctx, t('fjWaitCalendarHeader', { label }), T.waitPickerMonth, 400));

    try {
      await run(ctx, { type: 'closePopups' }, T.closePopups);
    } catch {
      // ignore
    }
    await gate(ctx, `06-month-${label.replace('/', '-')}`);
  });
}
