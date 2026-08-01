/**
 * LOGA3 WebView automation — composes core + shift + payslip inject handlers.
 *
 * German/LOGA3 labels match the live portal — not app i18n.
 */

import { AUTOMATION_DOM_HELPERS } from './automationDomHelpers';
import { AUTOMATION_HANDLERS_CORE } from './automationHandlersCore';
import { AUTOMATION_PORTAL_FINDERS } from './automationPortalFinders';
import { MONTH_LABELS, type AutomationCommand } from './automationTypes';
import { AUTOMATION_HANDLERS_PAYSLIP } from '../payslip/automationHandlers';
import { AUTOMATION_HANDLERS_SHIFT } from '../shift/automationHandlers';

export {
  getLoga3LoginUrl,
  requireLoga3Url,
  MONTH_LABELS,
  type CoreAutomationCommand,
  type ShiftAutomationCommand,
  type PayslipAutomationCommand,
  type AutomationCommand,
  type AutomationMessage,
} from './automationTypes';

export { PDF_CAPTURE_INJECT } from './pdfCaptureInject';

/**
 * Returns JS that runs inside the WebView and posts results via window.ReactNativeWebView.
 * fillLogin: password is a one-shot local (`__p`), cleared after field fill — not kept on `cmd`.
 */
export function buildAutomationScript(cmd: AutomationCommand): string {
  const isFillLogin = cmd.type === 'fillLogin';
  const payload = JSON.stringify(
    isFillLogin ? { type: 'fillLogin' as const, username: cmd.username, password: '' } : cmd
  );
  const passwordLiteral = isFillLogin ? JSON.stringify(cmd.password) : '""';
  const monthsJson = JSON.stringify(MONTH_LABELS);
  return `
(function() {
  var cmd = ${payload};
  var __p = ${passwordLiteral};
  var MONTH_LABELS = ${monthsJson};
${AUTOMATION_DOM_HELPERS}
  try {
${AUTOMATION_PORTAL_FINDERS}
${AUTOMATION_HANDLERS_CORE}
${AUTOMATION_HANDLERS_SHIFT}
${AUTOMATION_HANDLERS_PAYSLIP}
    post({ ok: false, error: 'unknown_command', type: cmd.type });
  } catch (err) {
    post({ ok: false, error: String(err && err.message || err), type: cmd.type });
  }
  return true;
})();
true;
`;
}
