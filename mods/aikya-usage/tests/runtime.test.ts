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
  expect(result.text).toMatch('5h [=---------] 14% | 7d [??????????] N/A')
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

function textOf(node): string {
  if (typeof node === 'string') return node
  return (node.children || []).map(textOf).join('')
}
function runsOf(node): Array<{text: string, color?: string, dimColor?: boolean}> {
  if (typeof node === 'string') return []
  if (node.type === 'Text' && node.children?.every(child => typeof child === 'string')) return [{ text: textOf(node), ...node.props }]
  return (node.children || []).flatMap(runsOf)
}

test('account windows color their own consumed segments and percentages on one line', async ($, on) => {
  engine(on)
  await $.session.measure({ ...usage, rateLimits: [{ kind: 'five_hour', percentUsed: 40 }, { kind: 'seven_day', percentUsed: 80 }], changed: ['rateLimits'] })
  const ui = await $.ui.mount(hint)
  const drawing = await ui.drawn()
  expect(textOf(drawing)).toMatch('5h [====------] 40% | 7d [========--] 80%')
  expect(drawing.props.dimColor).not.toBe(true)
  const runs = runsOf(drawing)
  expect(runs.some(run => run.text === '====' && run.color === 'success')).toBe(true)
  expect(runs.some(run => run.text === '========' && run.color === 'warning')).toBe(true)
  expect(runs.some(run => run.text === '40%' && run.color === 'success')).toBe(true)
  expect(runs.some(run => run.text === '80%' && run.color === 'warning')).toBe(true)
  expect(runs.some(run => run.text === '------' && run.dimColor === true)).toBe(true)
  expect(textOf(drawing)).not.toMatch('\n')
  expect(textOf(drawing)).not.toMatch('\x1b')
  await ui.unmount()
})

test('new account readings update the bars and hide/show preserves the native hint', async ($, on) => {
  engine(on)
  const ui = await $.ui.mount(hint)
  await $.session.measure({ ...usage, rateLimits: [{ kind: 'five_hour', percentUsed: 90 }, { kind: 'seven_day', percentUsed: 0 }], changed: ['rateLimits'] })
  const drawing = await ui.drawn()
  expect(textOf(drawing)).toMatch('5h [=========-] 90% | 7d [----------] 0%')
  expect(runsOf(drawing).some(run => run.text === '90%' && run.color === 'error')).toBe(true)
  expect(runsOf(drawing).some(run => run.text === '0%' && run.color === 'success')).toBe(true)
  await $.command.run({ command: 'aikya-usage', args: 'hide' })
  expect(textOf(await ui.drawn())).toBe('Engine hint')
  await $.command.run({ command: 'aikya-usage', args: 'show' })
  expect(textOf(await ui.drawn())).toMatch('90%')
  await ui.unmount()
})

for (const surface of ['terminal', 'desktop'] as const) {
  test('colored usage stays a single native text line on ' + surface, async ($, on) => {
    engine(on)
    await $.session.measure({ ...usage, rateLimits: [{ kind: 'five_hour', percentUsed: 40 }, { kind: 'seven_day', percentUsed: 80 }], changed: ['rateLimits'] })
    for (const columns of [100, 54, 36, 28]) {
      const ui = await $.ui.mount({ ...hint, surface, viewport: { ...hint.viewport, columns } })
      const drawing = await ui.drawn()
      const text = textOf(drawing)
      expect(drawing.type).toBe('Text')
      expect(text).not.toMatch('\n')
      expect(text).not.toMatch('\x1b')
      expect(text.length <= columns - 4).toBe(true)
      expect(text).toMatch('5h')
      expect(text).toMatch('7d')
      expect(text).toMatch('40%')
      expect(text).toMatch('80%')
      await ui.unmount()
    }
  })
}

test('the footer leaves room for Claude native mode indicators in an 80-column terminal', async ($, on) => {
  engine(on)
  await $.session.measure({ ...usage, rateLimits: [{ kind: 'five_hour', percentUsed: 40 }, { kind: 'seven_day', percentUsed: 80 }], changed: ['rateLimits'] })
  const ui = await $.ui.mount({ ...hint, viewport: { ...hint.viewport, columns: 80 } })
  const text = textOf(await ui.drawn())
  expect(text).toBe('Ctx:42% Tok:N/A | 5h [==---] 40% | 7d [====-] 80%')
  expect(text.length <= 56).toBe(true)
  await ui.unmount()
})
