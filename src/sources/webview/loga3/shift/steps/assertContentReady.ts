/**
 * Step: Monatsgrid bereit (content gate).
 *
 * Desktop path (loga3-workflow forceGridReload):
 * 1) Arm sidebar reload control (often CSS-hidden on phone — click anyway)
 * 2) Chrome month-arrows: one month away, then back to target → day-grid reloads
 * 3) Wait ≤10s for verify
 *
 * Popup month pick alone is NOT this step — it often flips only the title.
 */
import { t } from '@/src/i18n';
import {
  type Ctx,
  status,
  run,
  softProbe,
  timed,
  waitOpts,
  waitForCondition,
  T,
} from '../jobContext';

const WAIT_GRID_MS = T.waitGridAktualisierung;

export async function assertContentReady(ctx: Ctx, month: number, year: number): Promise<void> {
  const label = `${String(month).padStart(2, '0')}/${year}`;
  await timed(ctx, `content-${label}`, async () => {
    status(ctx, t('fjContentGate', { label }));

    const tryVerify = async () => {
      const v = await softProbe(ctx, { type: 'verifyCalendarMonth', month, year }, T.softProbeShort, true);
      return v.ok ? v : null;
    };

    if (await tryVerify()) {
      try {
        status(ctx, t('fjStepAction', { step: 'clickBerechnen' }));
        await run(ctx, { type: 'clickBerechnen' }, T.clickBerechnen);
      } catch {
        // optional Berechnen — not a second path
      }
      if (await tryVerify()) {
        status(ctx, t('fjContentGateOk', { label }));
        return;
      }
    }

    // One path: arm → arrows away → arrows to target → short wait
    status(ctx, t('fjGridReload', { label }));
    const arm = await run(ctx, { type: 'armCalendarReload' }, T.armCalendarReload);
    if (!arm.ok) {
      throw new Error(arm.error || t('fjArmCalendarMissing'));
    }

    const awayMonth = month === 12 ? 1 : month + 1;
    const awayYear = month === 12 ? year + 1 : year;
    status(ctx, t('fjStepAction', { step: `monthArrows ${awayMonth}/${awayYear} → ${label}` }));
    const away = await run(ctx, { type: 'selectMonth', month: awayMonth, year: awayYear }, T.selectMonth);
    if (!away.ok && !away.selected) {
      throw new Error(away.error || t('fjSelectMonthFailed', { label: `${String(awayMonth).padStart(2, '0')}/${awayYear}` }));
    }
    const back = await run(ctx, { type: 'selectMonth', month, year }, T.selectMonth);
    if (!back.ok && !back.selected) {
      throw new Error(back.error || t('fjSelectMonthFailed', { label }));
    }

    let lastReason = '';
    const waitLabel = t('fjWaitContentGate', { label });
    await waitForCondition(
      async () => {
        const v = await softProbe(ctx, { type: 'verifyCalendarMonth', month, year }, T.softProbeShort, true);
        if (v.ok) return v;
        if (typeof v.reason === 'string' && v.reason) lastReason = v.reason;
        return null;
      },
      {
        ...waitOpts(ctx, waitLabel, WAIT_GRID_MS, 250),
        onWait: (elapsed) =>
          status(
            ctx,
            t('fjWaitTick', {
              label: lastReason
                ? t('fjWaitContentGateHint', { label, reason: lastReason })
                : waitLabel,
              seconds: Math.round(elapsed / 1000),
              limit: String(Math.round(WAIT_GRID_MS / 1000)),
            })
          ),
      }
    );
    status(ctx, t('fjContentGateOk', { label }));
  });
}
