import { expect, test } from 'claude-code/testing'
import * as format from '../lib/usage.js'
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

test('each account window has its own bar followed by the exact percentage', () => {
  const view = normalizeUsage({ context: { percent: 42 }, rateLimits: [{ kind: 'five_hour', percentUsed: 40 }, { kind: 'seven_day', percentUsed: 80 }] }, 0)
  expect(footer(view, { total: 53000 }, 80)).toBe('Context: 42% | Tokens: 53k | Usage 5h [====------] 40% | 7d [========--] 80%')
  expect(footer(view, { total: 53000 }, 50)).toBe('Ctx:42% Tok:53k | 5h [==---] 40% | 7d [====-] 80%')
  for (const width of [24, 32, 50, 80]) {
    const line = footer(view, { total: 53000 }, width)
    expect(line.length <= width).toBe(true)
    expect(line).not.toMatch('\n')
    expect(line).toMatch('5h')
    expect(line).toMatch('7d')
    expect(line).toMatch('40%')
    expect(line).toMatch('80%')
  }
})


test('bar fill is bounded while exact usage and unavailable values stay distinct', () => {
  expect(typeof format.usageBar).toBe('function')
  for (const [value, cells, expected] of [
    [40, 10, '[====------] 40%'], [80, 10, '[========--] 80%'],
    [0, 5, '[-----] 0%'], [100, 5, '[=====] 100%'], [120, 5, '[=====] 120%'],
    [12.5, 10, '[=---------] 12.5%'], [null, 5, '[?????] N/A'],
    [NaN, 5, '[?????] N/A'], [-1, 5, '[?????] N/A'],
  ] as const) expect(format.usageBar(value, cells)).toBe(expected)
})

test('each window crosses the warning and critical boundaries independently', () => {
  expect(typeof format.usageTone).toBe('function')
  for (const [value, tone] of [[null, 'inactive'], [0, 'success'], [69.9, 'success'], [70, 'warning'], [89.9, 'warning'], [90, 'error'], [100, 'error'], [120, 'error']] as const) {
    expect(format.usageTone(value)).toBe(tone)
  }
  const view = normalizeUsage({ context: { percent: 42 }, rateLimits: [{ kind: 'five_hour', percentUsed: 40 }, { kind: 'seven_day', percentUsed: 80 }] }, 0)
  const parts = format.footerParts(view, { total: 53000 }, 80)
  expect(parts.map(part => part.text).join('')).toBe('Context: 42% | Tokens: 53k | Usage 5h [====------] 40% | 7d [========--] 80%')
  expect(parts.filter(part => part.tone === 'success').map(part => part.text).join('')).toBe('====40%')
  expect(parts.filter(part => part.tone === 'warning').map(part => part.text).join('')).toBe('========80%')
})

test('expired and missing windows never look like an empty zero-percent bar', () => {
  const view = normalizeUsage({ context: { percent: 0 }, rateLimits: [{ kind: 'five_hour', percentUsed: 40, resetsAt: '2026-01-01T00:00:00Z' }, { kind: 'seven_day', percentUsed: 0 }] }, Date.parse('2026-10-26T00:00:00Z'))
  expect(footer(view, { total: 0 }, 100)).toBe('Context: 0% | Tokens: 0 | Usage 5h [??????????] N/A | 7d [----------] 0%')
  expect(footer(normalizeUsage({}, 0), { total: null }, 100)).toBe('Context: N/A | Tokens: N/A | Usage 5h [??????????] N/A | 7d [??????????] N/A')
})
