import { expect, mock, test } from 'claude-code/testing'

const usage = { context: { tokens: 84000, window: 200000, percent: 42 }, rateLimits: [{ kind: 'five_hour', percentUsed: 14 }], cost: { usd: 0.1 } }
const counts = { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 50, cache_creation_input_tokens: 30, model: 'test' }
const hint = { plugin: 'aikya-usage', component: 'PromptHint' as const, surface: 'terminal' as const, requestId: 'prompt', props: { isDraft: false, isWorking: false, hint: '? for shortcuts' }, viewport: { columns: 100, rows: 30, isFullscreen: true } }
function engine(on) {
  mock.clock(on)
  on('session.usage', () => ({ value: usage }))
  on('command.register', () => ({ value: undefined }))
  on('session.start', () => ({ cwd: '/work' }))
  on('command.run', () => ({ text: 'Not handled' }))
  on('session.measure', ($, e) => ({ changed: e.changed }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('session.end', () => ({ sessionId: 's' }))
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['Engine hint'] }))
  on('turn.step', async function* ($, e) {
    yield { kind: 'text', index: 0, text: 'unchanged' }
    return { turnId: e.turnId, index: e.index, answer: 'unchanged', toolUses: [], stopReason: 'end_turn', usage: counts }
  })
}
async function step($, turnId = 't') {
  const stream = $.turn.step({ turnId, index: 0, model: 'test', messageCount: 1 })
  const chunks = []
  let item = await stream.next()
  while (!item.done) { chunks.push(item.value); item = await stream.next() }
  return { chunks, result: item.value }
}

test('Usage reads native metrics and answers locally without opening a pane', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })
  const result = await $.command.run({ command: 'aikya-usage', args: '' })
  expect(result.text).toMatch('Context: 42%')
  expect(result.text).toMatch('14%/N/A')
  expect(result.text).toMatch('Estimated session cost (USD): 0.1000')
})
test('token observer preserves streamed chunks and reconciles the final turn once', async ($, on) => {
  engine(on)
  await $.turn.start({ turnId: 't', text: 'private prompt' })
  const response = await step($)
  expect(response.chunks).toEqual([{ kind: 'text', index: 0, text: 'unchanged' }])
  expect(response.result.answer).toBe('unchanged')
  await $.turn.complete({ turnId: 't', answer: 'original answer', durationMs: 1, isAborted: false, reason: 'answer', usage: counts })
  const result = await $.command.run({ command: 'aikya-usage', args: '' })
  expect(result.text).toMatch('Tokens: 200')
  expect(result.text).not.toMatch('private prompt')
})
test('measurements update the one-line footer and session end clears old token readings', async ($, on) => {
  engine(on)
  await $.turn.start({ turnId: 't', text: 'test' })
  await step($)
  await $.session.measure({ ...usage, context: { ...usage.context, percent: 55 }, changed: ['context'] })
  const ui = await $.ui.mount(hint)
  expect(JSON.stringify(await ui.drawn())).toMatch('Context: 55%')
  expect(JSON.stringify(await ui.drawn())).toMatch('Tokens: 200')
  await $.session.end({ reason: 'clear', sessionId: 's', resume: { id: 's' } })
  expect(JSON.stringify(await ui.drawn())).not.toMatch('200')
  await ui.unmount()
})
test('footer leaves other render sites alone', async ($, on) => {
  engine(on)
  const ui = await $.ui.mount({ ...hint, component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 3, bodyColumns: 100 } })
  expect(JSON.stringify(await ui.drawn())).toMatch('Engine hint')
  await ui.unmount()
})
