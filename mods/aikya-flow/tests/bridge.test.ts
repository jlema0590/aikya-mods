import { expect, test } from 'claude-code/testing'
import { validateIndex, selectExecution } from '../lib/bridge.js'

const context = { identity: 'a'.repeat(64), session_id: 'claude-session', invocation_id: 'b'.repeat(32), command: 'aikya-analyze' }
const entry = { identity: 'c'.repeat(64), run_id: 'run-1', mode: 'preview', focus: 'architecture' }
const index = () => ({ schema: 1, ...context, runs: [entry] })

test('index accepts only the current invocation and safe bounded references', () => {
  expect(validateIndex(index(), context)).toEqual([entry])
  for (const raw of [null, { ...index(), session_id: 'other' }, { ...index(), invocation_id: 'd'.repeat(32) },
    { ...index(), runs: [{ ...entry, run_id: '../other' }] }, { ...index(), runs: [{ ...entry, identity: '../outside' }] },
    { ...index(), runs: Array(65).fill(entry) }, { ...index(), runs: [{ ...entry, focus: 'raw prompt' }] }]) {
    expect(validateIndex(raw, context)).toBeNull()
  }
})

test('parallel runs show active work first without combining their phase evidence', () => {
  const completed = { runId: 'preview', status: 'completed' }
  const running = { runId: 'architecture', status: 'running' }
  const waiting = { runId: 'security', status: 'waiting' }
  expect(selectExecution([completed, running, waiting]).runId).toBe('architecture')
  expect(selectExecution([completed, { ...running, status: 'failed' }]).runId).toBe('architecture')
  expect(selectExecution([completed, { ...running, status: 'completed' }]).runId).toBe('architecture')
})

test('an untouched dispatch snapshot cannot hide a child execution in a worktree', () => {
  const dispatch = { runId: 'parent', mode: 'observed', status: 'running', phases: [{ status: 'pending' }, { status: 'skipped' }] }
  const child = { runId: 'worktree-analysis', mode: 'preview', status: 'running', phases: [{ status: 'running' }] }
  expect(selectExecution([dispatch, child]).runId).toBe('worktree-analysis')
  expect(selectExecution([dispatch, { ...child, status: 'completed' }]).runId).toBe('worktree-analysis')
})
