export const PHASES = ['explore', 'plan', 'implement', 'validate', 'security', 'review'];
const READ_ONLY = new Set(['aikya-verify', 'aikya-tests', 'aikya-quality', 'aikya-tokens', 'aikya-skills-status', 'aikya-skills-plan', 'aikya-sdd-status', 'aikya-doctor', 'aikya-arc-review']);
const SHORT = new Set(['feature', 'mobile-feature', 'bugfix', 'analyze', 'verify', 'tests', 'quality', 'tokens']);
export const clean = value => typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f-\u009f]/g, '').slice(0, 160) : '';
export function normalizeCommand(value) {
  if (typeof value !== 'string') return null;
  const token = value.replace(/^\//, '').trim().split(/\s/)[0];
  let name = token.split(':').pop();
  if (SHORT.has(name) && (token.includes('aikya:') || !token.includes(':'))) name = 'aikya-' + name;
  if (!/^aikya-[a-z0-9-]+$/.test(name) || ['aikya-flow', 'aikya-usage', 'aikya-boxbot'].includes(name)) return null;
  return name;
}
export function recipe(command) {
  const fix = command === 'aikya-bugfix';
  const fixLabels = { explore: 'Reproduce', plan: 'Diagnose', implement: 'Fix', validate: 'Regression' };
  return PHASES.map(id => ({ id, label: fix && fixLabels[id] ? fixLabels[id] : id[0].toUpperCase() + id.slice(1),
    status: READ_ONLY.has(command) && id === 'implement' ? 'skipped' : 'unknown',
    reason: READ_ONLY.has(command) && id === 'implement' ? 'Not applicable to this read-only recipe' : '' }));
}
export function createFlow() {
  return { epoch: 0, command: null, status: 'Idle', activity: 'Waiting for a command', turnId: null, pendingTurn: false, running: false, startedAt: 0, snapshot: null, blockedRunId: null, toolCount: 0 };
}
export function beginRun(flow, command, now) {
  flow.blockedRunId = flow.snapshot?.runId || flow.blockedRunId;
  flow.epoch += 1;
  flow.command = command;
  flow.status = 'Running';
  flow.activity = 'Command observed';
  flow.turnId = null;
  flow.pendingTurn = true;
  flow.running = true;
  flow.startedAt = now;
  flow.snapshot = null;
  flow.toolCount = 0;
}
export function observeSkill(flow, command, now) {
  if (flow.running) {
    if (flow.command !== command) flow.activity = 'Nested skill: /' + command;
    return;
  }
  beginRun(flow, command, now);
}
export function endTurn(flow, event) {
  if (event.agentId || flow.turnId !== event.turnId) return;
  flow.running = false;
  flow.pendingTurn = false;
  flow.status = event.isAborted || event.reason === 'aborted' ? 'Interrupted' : event.reason === 'error' ? 'Error' : event.reason === 'refusal' ? 'Refused' : 'Turn ended';
  flow.activity = flow.status === 'Turn ended' ? '' : 'Native turn ' + flow.status.toLowerCase();
}
export function phaseRows(flow) {
  const rows = recipe(flow.command);
  if (!flow.snapshot) return rows;
  return rows.map(row => ({ ...row, ...flow.snapshot.phases.find(item => item.id === row.id), label: row.label }));
}
export const LABELS = { unknown: 'No evidence', pending: 'Pending', running: 'Running', waiting: 'Waiting', completed: 'Completed', failed: 'Failed', skipped: 'Not applicable', blocked: 'Blocked', interrupted: 'Interrupted' };
export const SYMBOLS = { unknown: '?', pending: '○', running: '●', waiting: '◷', completed: '✓', failed: '×', skipped: '—', blocked: '!', interrupted: '■' };
