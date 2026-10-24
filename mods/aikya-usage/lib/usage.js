const FIELDS = ['input_tokens', 'output_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens'];
const finite = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const metric = value => finite(value) ? value : null;

export function normalizeUsage(raw, nowMs) {
  const data = raw && typeof raw === 'object' ? raw : {};
  const context = data.context || {};
  const quota = kind => {
    const window = Array.isArray(data.rateLimits) ? data.rateLimits.find(row => row?.kind === kind) : undefined;
    if (!window || !finite(window.percentUsed)) return null;
    if (window.resetsAt !== undefined) {
      const reset = Date.parse(window.resetsAt);
      if (!Number.isFinite(reset) || reset <= nowMs) return null;
    }
    return window.percentUsed;
  };
  const percent = metric(context.percent);
  return {
    contextPercent: percent !== null && percent <= 100 ? percent : null,
    contextTokens: metric(context.tokens), window: metric(context.window),
    fiveHour: quota('five_hour'), sevenDay: quota('seven_day'), costUsd: metric(data.cost?.usd),
  };
}

export function createLedger() { return { turns: new Map(), partial: false }; }
export function turnKey(event) { return JSON.stringify([event.agentId || '', event.turnId]); }
function counts(usage) {
  if (!usage || !FIELDS.every(field => Number.isSafeInteger(usage[field]) && usage[field] >= 0)) return null;
  return FIELDS.map(field => usage[field]);
}
function row(ledger, event) {
  if (typeof event.turnId !== 'string' || !event.turnId) { ledger.partial = true; return null; }
  const key = turnKey(event);
  if (!ledger.turns.has(key)) {
    if (ledger.turns.size >= 256) { ledger.partial = true; return null; }
    ledger.turns.set(key, { steps: new Map(), final: null, missing: false });
  }
  return ledger.turns.get(key);
}
export function recordStep(ledger, event, usage) {
  const turn = row(ledger, event);
  if (!turn) return;
  const value = counts(usage);
  if (!value || !Number.isSafeInteger(event.index) || event.index < 0) { turn.missing = true; return; }
  if (!turn.steps.has(event.index) && turn.steps.size >= 256) { turn.missing = true; return; }
  turn.steps.set(event.index, value);
}
export function recordTurn(ledger, event) {
  const turn = row(ledger, event);
  if (!turn) return;
  const value = counts(event.usage);
  if (value) turn.final = value;
  else turn.missing = true;
}
export function readLedger(ledger) {
  const values = [0, 0, 0, 0];
  let observed = false, partial = ledger.partial;
  for (const turn of ledger.turns.values()) {
    if (!turn.final && turn.missing) partial = true;
    const rows = turn.final ? [turn.final] : [...turn.steps.values()];
    for (const counts of rows) {
      observed = true;
      counts.forEach((value, index) => { values[index] += value; });
    }
  }
  const total = values.reduce((sum, count) => sum + count, 0);
  if (!Number.isSafeInteger(total)) return { total: null, partial: true };
  return { input: observed ? values[0] : null, output: observed ? values[1] : null, cacheRead: observed ? values[2] : null, cacheWrite: observed ? values[3] : null, total: observed ? total : null, partial };
}
function number(value) {
  if (value === null || value === undefined) return 'N/A';
  if (value >= 1000000000) return (value / 1000000000).toFixed(1).replace(/\.0$/, '') + 'b';
  if (value >= 1000000) return (value / 1000000).toFixed(1).replace(/\.0$/, '') + 'm';
  if (value >= 1000) return (value / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return String(value);
}
const percent = value => value === null ? 'N/A' : String(Math.round(value * 10) / 10) + '%';
export function footer(view, totals, columns) {
  const context = percent(view.contextPercent), tokens = number(totals.total);
  const used = percent(view.fiveHour) + '/' + percent(view.sevenDay);
  const full = `Context: ${context} | Tokens: ${tokens} | Usage 5h/7d: ${used}`;
  if (full.length <= columns) return full;
  const compact = `Ctx:${context} Tok:${tokens} U5h/7d:${used}`;
  if (compact.length <= columns) return compact;
  return `C:${context} T:${tokens} U:${used}`;
}
export function details(view, totals) {
  const reading = value => value === null || value === undefined ? 'N/A' : String(value);
  return [
    'AIKYA USAGE', footer(view, totals, 200),
    `Context tokens/window: ${reading(view.contextTokens)}/${reading(view.window)}`,
    'Observed tokens since this mod loaded (including cached input):',
    `Input: ${reading(totals.input)} | Output: ${reading(totals.output)}`,
    `Cache read: ${reading(totals.cacheRead)} | Cache write: ${reading(totals.cacheWrite)}`,
    `Coverage: ${totals.partial ? 'Partial; some token records are missing' : 'Observed requests only; earlier history is not included'}`,
    `Estimated session cost (USD): ${view.costUsd === null ? 'N/A' : view.costUsd.toFixed(4)}`,
    'Usage percentages are account-window readings from Claude Code; they are not inferred from tokens.',
  ].join('\n');
}
