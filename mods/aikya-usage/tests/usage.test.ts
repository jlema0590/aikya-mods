import { expect, test } from 'claude-code/testing'
import { normalizeUsage, createLedger, recordStep, recordTurn, readLedger, footer } from '../lib/usage.js'

const counts = { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 50, cache_creation_input_tokens: 30, model: 'test' }
const event = { turnId: 'one', index: 0 }

test('missing metrics stay unavailable and actual zero values remain zero', () => {
  expect(normalizeUsage({}, 0)).toMatchObject({ contextPercent: null, fiveHour: null, sevenDay: null, costUsd: null })
  expect(normalizeUsage({ context: { percent: 0, tokens: 0, window: 200000 }, rateLimits: [{ kind: 'five_hour', percentUsed: 0 }], cost: { usd: 0 } }, 0)).toMatchObject({ contextPercent: 0, fiveHour: 0, costUsd: 0 })
})
test('expired quota windows and invalid numeric readings are unavailable', () => {
  expect(normalizeUsage({ context: { percent: NaN }, rateLimits: [
    { kind: 'five_hour', percentUsed: 42, resetsAt: '2026-01-01T00:00:00Z' },
    { kind: 'seven_day', percentUsed: 17, resetsAt: '2027-01-01T00:00:00Z' },
  ] }, Date.parse('2026-10-24T00:00:00Z'))).toMatchObject({ contextPercent: null, fiveHour: null, sevenDay: 17 })
})
test('repeated step and final turn totals are counted once including cache categories', () => {
  const ledger = createLedger()
  recordStep(ledger, event, counts)
  recordStep(ledger, event, counts)
  expect(readLedger(ledger)).toMatchObject({ total: 200, input: 100, output: 20, cacheRead: 50, cacheWrite: 30 })
  recordTurn(ledger, { turnId: 'one', usage: counts })
  recordTurn(ledger, { turnId: 'one', usage: counts })
  expect(readLedger(ledger).total).toBe(200)
})
test('final turn summary reconciles missing steps without double counting', () => {
  const ledger = createLedger()
  recordStep(ledger, event, counts)
  recordTurn(ledger, { turnId: 'one', usage: { ...counts, input_tokens: 300 } })
  recordStep(ledger, { ...event, index: 1 }, counts)
  expect(readLedger(ledger).total).toBe(400)
})
test('main and subagent turns have distinct request identities', () => {
  const ledger = createLedger()
  recordStep(ledger, event, counts)
  recordStep(ledger, { ...event, agentId: 'worker' }, counts)
  expect(readLedger(ledger).total).toBe(400)
})
test('unreported or malformed tokens never become a complete zero reading', () => {
  const ledger = createLedger()
  recordStep(ledger, event, null)
  recordStep(ledger, { turnId: 'two', index: 0 }, { input_tokens: 100 })
  expect(readLedger(ledger)).toMatchObject({ total: null, input: null, output: null, partial: true })
})
test('bounded observation keeps known totals and marks coverage partial instead of recounting evicted turns', () => {
  const ledger = createLedger()
  for (let i = 0; i < 257; i++) recordStep(ledger, { turnId: 'turn-' + i, index: 0 }, counts)
  expect(readLedger(ledger)).toMatchObject({ total: 51200, partial: true })
  recordStep(ledger, { turnId: 'turn-0', index: 0 }, counts)
  expect(readLedger(ledger).total).toBe(51200)
})
test('full and narrow footer formats keep all three measurements on one line', () => {
  const view = normalizeUsage({ context: { percent: 42 }, rateLimits: [{ kind: 'five_hour', percentUsed: 14 }, { kind: 'seven_day', percentUsed: 28 }] }, 0)
  for (const width of [32, 50, 100]) {
    const line = footer(view, { total: 53000 }, width)
    expect(line.length <= width).toBe(true)
    expect(line).not.toMatch('\n')
    expect(line).toMatch('42')
    expect(line).toMatch('53k')
    expect(line).toMatch('14')
    expect(line).toMatch('28')
  }
  expect(footer(normalizeUsage({}, 0), { total: null }, 80)).toMatch('N/A')
})
