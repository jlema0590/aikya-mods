import { LABELS, SYMBOLS } from './flow.js';

const COLORS = { unknown: 'inactive', pending: 'inactive', running: 'cyan', waiting: 'warning', completed: 'success', failed: 'error', skipped: 'inactive', blocked: 'warning', interrupted: 'warning' };
export function phaseView(rows, { bodyColumns, bodyRows, placement } = {}) {
  const columns = Number.isFinite(bodyColumns) && bodyColumns > 0 ? bodyColumns : 38;
  return { mode: placement === 'dock' && columns >= 32 && bodyRows >= 45 ? 'cards' : 'compact',
    width: Math.min(40, columns), nodes: rows.map(row => ({ ...row, symbol: SYMBOLS[row.status], stateLabel: LABELS[row.status], color: COLORS[row.status] })) };
}
