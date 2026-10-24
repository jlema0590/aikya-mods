import { expect, mock, test } from 'claude-code/testing'

const pane = {
  plugin: 'aikya-boxbot',
  component: 'Pane' as const,
  requestId: 'aikya-boxbot',
  props: { title: 'Aikya BoxBot', placement: 'inline' as const },
  viewport: { columns: 80, rows: 24, isFullscreen: false },
}

function engineStubs(on) {
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.close', () => ({ value: undefined }))
  on('command.run', () => ({ text: 'Command not handled' }))
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['Engine drawing'] }))
}

test('the local command opens its pane without starting a model turn', async ($, on) => {
  engineStubs(on)
  mock.clock(on)
  const result = await $.command.run({ command: 'aikya-boxbot', args: '' })
  expect(result.text).toBeUndefined()
  const ui = await $.ui.mount({ ...pane, surface: 'terminal' })
  expect(await ui.find({ type: 'Code' })).toBeDefined()
  await ui.unmount()
})

test('terminal animation pauses and resumes from the same position', async ($, on) => {
  engineStubs(on)
  const clock = mock.clock(on)
  await $.command.run({ command: 'aikya-boxbot', args: '' })
  const ui = await $.ui.mount({ ...pane, surface: 'terminal' })
  const initial = JSON.stringify(await ui.drawn())
  await clock.advance(1000)
  expect(JSON.stringify(await ui.drawn())).not.toBe(initial)
  await $.command.run({ command: 'aikya-boxbot', args: 'pause' })
  const paused = JSON.stringify(await ui.drawn())
  await clock.advance(2000)
  expect(JSON.stringify(await ui.drawn())).toBe(paused)
  await $.command.run({ command: 'aikya-boxbot', args: 'resume' })
  const resumed = JSON.stringify(await ui.drawn())
  await clock.advance(1000)
  expect(JSON.stringify(await ui.drawn())).not.toBe(resumed)
  await ui.unmount()
})

test('still mode holds an accessible conveyor frame without motion', async ($, on) => {
  engineStubs(on)
  const clock = mock.clock(on)
  await $.command.run({ command: 'aikya-boxbot', args: 'still' })
  const ui = await $.ui.mount({ ...pane, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: 'Still mode' })).toBeDefined()
  const initial = JSON.stringify(await ui.drawn())
  await clock.advance(5000)
  expect(JSON.stringify(await ui.drawn())).toBe(initial)
  await ui.unmount()
})

test('desktop and editor render the conveyor with an accessible SVG alternative', async ($, on) => {
  engineStubs(on)
  mock.clock(on)
  await $.command.run({ command: 'aikya-boxbot', args: 'still' })
  for (const surface of ['desktop', 'vscode'] as const) {
    const ui = await $.ui.mount({ ...pane, surface })
    expect(await ui.find({ type: 'Svg' })).toBeDefined()
    expect(JSON.stringify(await ui.drawn())).toMatch('Boxes moving from left to right on a conveyor belt')
    await ui.unmount()
  }
})

test('closing the pane stops animation work until the user opens it again', async ($, on) => {
  engineStubs(on)
  const clock = mock.clock(on)
  await $.command.run({ command: 'aikya-boxbot', args: '' })
  const ui = await $.ui.mount({ ...pane, surface: 'terminal' })
  await $.command.run({ command: 'aikya-boxbot', args: 'hide' })
  const closed = JSON.stringify(await ui.drawn())
  await clock.advance(5000)
  expect(JSON.stringify(await ui.drawn())).toBe(closed)
  await ui.unmount()
  await $.command.run({ command: 'aikya-boxbot', args: '' })
  const reopened = await $.ui.mount({ ...pane, surface: 'terminal' })
  expect(await reopened.find({ type: 'Code' })).toBeDefined()
  await reopened.unmount()
})

test('a narrow pane keeps the conveyor artwork within its actual body width', async ($, on) => {
  engineStubs(on)
  mock.clock(on)
  await $.command.run({ command: 'aikya-boxbot', args: 'still' })
  const ui = await $.ui.mount({ ...pane, surface: 'terminal', props: { ...pane.props, bodyColumns: 20 } })
  const drawing = await ui.drawn()
  function codeSource(node): string {
    if (node.type === 'Code') return node.props.source
    for (const child of node.children || []) {
      if (typeof child === 'object') {
        const source = codeSource(child)
        if (source) return source
      }
    }
    return ''
  }
  const source = codeSource(drawing)
  expect(source).toMatch('+--+')
  expect(source.split('\n').every(line => line.length <= 20)).toBe(true)
  await ui.unmount()
})
