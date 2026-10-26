import { SYMBOLS } from './flow.js';

export const FRAME_MS = 250;
const FRAMES = ['◐', '◓', '◑', '◒'];
export function motionFrame({ phaseStatus, nativeRunning = false, still = false, frame = 0 }) {
  const running = phaseStatus === undefined ? nativeRunning : phaseStatus === 'running';
  const animate = running && !still;
  return { symbol: animate ? FRAMES[frame % FRAMES.length] : SYMBOLS[phaseStatus] || '●', animate };
}
export function transitionEmphasis(previous, current, changedAt, now) {
  const result = { phaseIds: [], connectorIds: [] };
  if (!previous || !current || previous.runId !== current.runId || previous.generation !== current.generation || now < changedAt || now - changedAt >= FRAME_MS) return result;
  current.phases.forEach((phase, index) => {
    const old = previous.phases.find(row => row.id === phase.id);
    if (old && old.status !== phase.status && ['completed','failed','blocked'].includes(phase.status)) result.phaseIds.push(phase.id);
    const next = current.phases[index + 1];
    const oldNext = next && previous.phases.find(row => row.id === next.id);
    if (phase.status === 'completed' && next?.status === 'running' && oldNext && oldNext.status !== 'running') result.connectorIds.push(phase.id);
  });
  return result;
}
