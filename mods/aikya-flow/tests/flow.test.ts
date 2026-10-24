import { expect, test } from 'claude-code/testing'
import { createFlow, normalizeCommand, recipe, beginRun, observeSkill, endTurn } from '../lib/flow.js'
import { acceptSnapshot, executionIdentity } from '../lib/snapshot.js'

const phases = ['explore','plan','implement','validate','security','review']
const identity = 'a'.repeat(64)
function snapshot() {
  return { schema: 1, identity, run_id: 'run-1', command: 'aikya-feature', status: 'running', revision: 4, candidate_generation: 2, started_at: 10, updated_at: 12,
    phases: Object.fromEntries(phases.map(phase => [phase, { status: 'pending', reason: '', evidence: [], actors: {} }])) }
}

test('command aliases normalize and recipes differ for fixes and read-only verification', () => {
  expect(normalizeCommand('/aikya:feature')).toBe('aikya-feature')
  expect(normalizeCommand('aikya:aikya-bugfix')).toBe('aikya-bugfix')
  expect(normalizeCommand('aikya-usage')).toBeNull()
  expect(recipe('aikya-bugfix').find(row => row.id === 'validate').label).toBe('Regression')
  expect(recipe('aikya-verify').find(row => row.id === 'implement').status).toBe('skipped')
})
test('a command and its skill expansion share one invocation while a new command resets evidence', () => {
  const flow = createFlow()
  beginRun(flow, 'aikya-feature', 10000)
  const epoch = flow.epoch
  observeSkill(flow, 'aikya-feature', 10000)
  expect(flow.epoch).toBe(epoch)
  flow.snapshot = snapshot()
  beginRun(flow, 'aikya-bugfix', 11000)
  expect(flow.epoch).toBe(epoch + 1)
  expect(flow.snapshot).toBeNull()
})
test('late turn completion cannot finish a replacement invocation and interruption is explicit', () => {
  const flow = createFlow()
  beginRun(flow, 'aikya-feature', 0)
  flow.turnId = 'new'
  endTurn(flow, { turnId: 'old', reason: 'answer' })
  expect(flow.status).toBe('Running')
  endTurn(flow, { turnId: 'new', reason: 'aborted', isAborted: true })
  expect(flow.status).toBe('Interrupted')
  expect(flow.snapshot).toBeNull()
})
test('a matching current snapshot preserves phase states and never trusts an older revision', () => {
  const raw = snapshot()
  const accepted = acceptSnapshot(raw, { identity, runId: 'run-1', command: 'aikya-feature', minStartedAt: 0 })
  expect(accepted).toMatchObject({ runId: 'run-1', revision: 4, generation: 2 })
  expect(acceptSnapshot({ ...raw, revision: 3 }, { identity, runId: 'run-1', previous: accepted })).toBeNull()
})
test('foreign identity, superseded run, old start time and malformed snapshots are rejected', () => {
  const raw = snapshot()
  for (const [input, context] of [
    [raw, { identity: 'b'.repeat(64), runId: 'run-1' }],
    [raw, { identity, runId: 'run-2' }],
    [raw, { identity, runId: 'run-1', minStartedAt: 20000 }],
    [{ ...raw, schema: 2 }, { identity, runId: 'run-1' }],
    [{ ...raw, phases: {} }, { identity, runId: 'run-1' }],
    [{ ...raw, run_id: null }, { identity }],
  ]) expect(acceptSnapshot(input, context)).toBeNull()
})
test('successful checks require evidence bound to the current candidate generation', () => {
  const raw = snapshot()
  raw.phases.validate = { status: 'completed', reason: '', evidence: [{ kind: 'process', check: 'unit tests', exit_code: 0 }], actors: { main: { status: 'completed', candidate_generation: 1 } } }
  expect(acceptSnapshot(raw, { identity, runId: 'run-1' })).toBeNull()
  raw.phases.validate.actors.main.candidate_generation = 2
  expect(acceptSnapshot(raw, { identity, runId: 'run-1' }).phases.find(row => row.id === 'validate').status).toBe('completed')
  raw.phases.validate.evidence[0].exit_code = 1
  expect(acceptSnapshot(raw, { identity, runId: 'run-1' })).toBeNull()
})
test('empty completion evidence is never accepted as a verified phase', () => {
  const raw = snapshot()
  raw.phases.explore.status = 'completed'
  expect(acceptSnapshot(raw, { identity, runId: 'run-1' })).toBeNull()
})
