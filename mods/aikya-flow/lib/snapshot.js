import { PHASES, clean, normalizeCommand } from './flow.js';
const STATES = new Set(['pending', 'running', 'waiting', 'completed', 'failed', 'skipped', 'blocked', 'interrupted']);
const integer = value => Number.isSafeInteger(value) && value >= 0;
export async function executionIdentity(root, sessionId) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(root + '\0' + sessionId));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}
function hasEvidence(phase, items) {
  return Array.isArray(items) && items.length > 0 && items.length <= 40 && items.every(item => {
    if (!item || typeof item.check !== 'string' || !item.check.trim()) return false;
    if (phase === 'review') return item.kind === 'review' && item.result === 'passed' && typeof item.reviewer === 'string' && item.reviewer.trim() && /^[a-f0-9]{64}$/.test(item.candidate);
    if (phase === 'validate' || phase === 'security') return item.kind === 'process' ? item.exit_code === 0 : item.kind === 'inspection' && item.result === 'passed';
    return item.result === 'recorded' || item.result === 'passed';
  });
}
export function acceptSnapshot(raw, context) {
  if (!raw || raw.schema !== 1 || raw.identity !== context.identity || typeof raw.run_id !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(raw.run_id)) return null;
  if ((context.runId && raw.run_id !== context.runId) || raw.run_id === context.blockedRunId) return null;
  if (!integer(raw.revision) || !integer(raw.candidate_generation) || !STATES.has(raw.status)) return null;
  if (!Number.isFinite(raw.started_at) || !Number.isFinite(raw.updated_at) || raw.updated_at < raw.started_at) return null;
  if (context.invocationId ? raw.flow_invocation !== context.invocationId : context.minStartedAt && raw.started_at * 1000 < context.minStartedAt) return null;
  const command = normalizeCommand(raw.command);
  if (!command || (context.command && command !== context.command)) return null;
  const previous = context.previous;
  if (previous?.runId === raw.run_id && (raw.revision < previous.revision || raw.candidate_generation < previous.generation)) return null;
  if (!raw.phases || PHASES.some(name => !raw.phases[name])) return null;
  const phases = [];
  for (const id of PHASES) {
    const phase = raw.phases[id];
    if (!phase || !STATES.has(phase.status) || !Array.isArray(phase.evidence)) return null;
    if (['skipped', 'blocked', 'failed', 'waiting', 'interrupted'].includes(phase.status) && !clean(phase.reason)) return null;
    if (phase.status === 'completed') {
      if (!hasEvidence(id, phase.evidence)) return null;
      if (['validate', 'security', 'review'].includes(id)) {
        const actors = Object.values(phase.actors || {}).filter(actor => actor?.candidate_generation === raw.candidate_generation);
        if (!actors.length || actors.some(actor => !['completed', 'skipped'].includes(actor.status))) return null;
      }
    }
    phases.push({ id, status: phase.status, reason: clean(phase.reason) });
  }
  if (raw.status === 'completed' && phases.some(phase => !['completed', 'skipped'].includes(phase.status))) return null;
  return { runId: raw.run_id, command, revision: raw.revision, generation: raw.candidate_generation, status: raw.status, activity: clean(raw.activity), phases };
}
