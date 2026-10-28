const FOCUSES = new Set(['general', 'architecture', 'security', 'infrastructure', 'operations']);
const MODES = new Set(['observed', 'preview', 'approved']);
export function validateIndex(raw, context) {
  if (!raw || raw.schema !== 1 || ['identity', 'session_id', 'invocation_id', 'command'].some(key => raw[key] !== context[key])) return null;
  if (!Array.isArray(raw.runs) || raw.runs.length > 64) return null;
  const seen = new Set();
  for (const row of raw.runs) {
    if (!row || !/^[a-f0-9]{64}$/.test(row.identity) || !/^[a-zA-Z0-9-]{1,80}$/.test(row.run_id) || !FOCUSES.has(row.focus) || !MODES.has(row.mode)) return null;
    const key = row.identity + ':' + row.run_id;
    if (seen.has(key)) return null;
    seen.add(key);
  }
  return raw.runs;
}
export function selectExecution(runs) {
  const executed = runs.filter(run => run.mode !== 'observed' || run.phases.some(phase => !['pending', 'skipped'].includes(phase.status)));
  const candidates = executed.length ? executed : runs;
  return candidates.find(run => ['running', 'waiting', 'pending'].includes(run.status))
    || [...candidates].reverse().find(run => ['failed', 'blocked', 'interrupted'].includes(run.status))
    || candidates[candidates.length - 1] || null;
}
export function executionLabel(row) {
  const title = value => value[0].toUpperCase() + value.slice(1);
  return title(row.focus) + ' · ' + title(row.mode);
}
