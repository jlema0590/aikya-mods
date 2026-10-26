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

for (const tier of ['prepend', 'append'] as const) {
  test('BoxBot composes below the Flow pane and stops when it closes (' + tier + ')', {
    plugins: [{ name: 'flow-site', tier, register(on) {
      on('ui.render', { component: 'Pane' }, async ($, e, next) => {
        if (e.requestId !== 'aikya-flow') return next(e)
        const { Box, Text } = $.ui.resolve(e)
        return Box({ children: [Text({ children: ['AIKYA FLOW'] }), await next(e)] })
      })
      on('command.run', { command: 'close-flow' }, async ($) => { await $.ui.close({ id: 'aikya-flow' }); return {} })
    } }],
  }, async ($, on) => {
    engineStubs(on)
    const clock = mock.clock(on)
    const ui = await $.ui.mount({ ...pane, requestId: 'aikya-flow', surface: 'terminal' })
    const initial = JSON.stringify(await ui.drawn())
    expect(initial).toMatch('AIKYA BOXBOT')
    expect(initial.indexOf('AIKYA FLOW') < initial.indexOf('AIKYA BOXBOT')).toBe(true)
    await clock.advance(1000)
    expect(JSON.stringify(await ui.drawn())).not.toBe(initial)
    await $.command.run({ command: 'aikya-boxbot', args: 'hide' })
    expect(JSON.stringify(await ui.drawn())).not.toMatch('AIKYA BOXBOT')
    await $.command.run({ command: 'aikya-boxbot', args: 'show' })
    expect(JSON.stringify(await ui.drawn())).toMatch('AIKYA BOXBOT')
    await $.command.run({ command: 'close-flow', args: '' })
    const closed = JSON.stringify(await ui.drawn())
    await clock.advance(3000)
    expect(JSON.stringify(await ui.drawn())).toBe(closed)
    await ui.unmount()
  })
}

for (const surface of ['terminal', 'desktop', 'vscode'] as const) {
  for (const rows of [18, 36]) {
    test('the standalone dock uses its measured body height and places BoxBot at the bottom (' + surface + ', ' + rows + ' rows)', async ($, on) => {
      engineStubs(on)
      mock.clock(on)
      await $.command.run({ command: 'aikya-boxbot', args: 'still' })
      const ui = await $.ui.mount({ ...pane, surface, props: { ...pane.props, placement: 'dock', bodyColumns: 38, scroll: { offset: 0, bodyRows: rows } }, viewport: { columns: 180, rows: 60, isFullscreen: true } })
      const drawing = await ui.drawn()
      expect(drawing.props.minHeight).toBe(rows)
      expect(drawing.props.justifyContent).toBe('flex-end')
      expect(drawing.children.length).toBe(1)
      expect(JSON.stringify(drawing)).toMatch('AIKYA BOXBOT')
      await ui.unmount()
    })
  }
}

test('an inline pane remains compact instead of reserving the terminal height', async ($, on) => {
  engineStubs(on)
  mock.clock(on)
  await $.command.run({ command: 'aikya-boxbot', args: 'still' })
  const ui = await $.ui.mount({ ...pane, surface: 'terminal', props: { ...pane.props, scroll: { offset: 0, bodyRows: 12 } }, viewport: { columns: 80, rows: 60, isFullscreen: false } })
  const drawing = await ui.drawn()
  expect(drawing.props.minHeight).toBeUndefined()
  expect(JSON.stringify(drawing)).toMatch('AIKYA BOXBOT')
  await ui.unmount()
})

for (const tier of ['prepend', 'append'] as const) {
  test('the shared pane contains one full-height frame and one bottom BoxBot (' + tier + ')', {
    plugins: [{ name: 'flow-layout', tier, register(on) {
      on('ui.render', { component: 'Pane' }, async ($, e, next) => {
        const { Box, Text } = $.ui.resolve(e)
        return Box({ key: 'aikya-mods-pane', minHeight: e.props.scroll.bodyRows, flexDirection: 'column', justifyContent: 'space-between', children: [
          Box({ key: 'aikya-flow-content', flexShrink: 0, children: [Text({ children: ['AIKYA FLOW'] })] }),
          Box({ key: 'aikya-mods-footer', flexDirection: 'column', flexShrink: 0, children: [await next(e)] }),
        ] })
      })
    } }],
  }, async ($, on) => {
    engineStubs(on)
    mock.clock(on)
    const ui = await $.ui.mount({ ...pane, requestId: 'aikya-flow', surface: 'terminal', props: { ...pane.props, placement: 'dock', scroll: { offset: 0, bodyRows: 32 } } })
    const drawing = await ui.drawn()
    expect(drawing.props.key).toBe('aikya-mods-pane')
    expect(drawing.props.minHeight).toBe(32)
    expect(drawing.props.justifyContent).toBe('space-between')
    const footer = await ui.find({ key: 'aikya-mods-footer' })
    expect(JSON.stringify(footer)).toMatch('AIKYA BOXBOT')
    expect(JSON.stringify(drawing).split('AIKYA BOXBOT').length - 1).toBe(1)
    expect(JSON.stringify(drawing).split('"minHeight":32').length - 1).toBe(1)
    expect(drawing.children[0].props.key).toBe('aikya-flow-content')
    await ui.unmount()
  })
}

test('BoxBot fills an empty Flow footer whose children are omitted by the host', {
  plugins: [{ name: 'empty-flow-footer', tier: 'append', register(on) {
    on('ui.render', { component: 'Pane' }, async ($, e) => {
      const { Box, Text } = $.ui.resolve(e)
      return Box({ key: 'aikya-mods-pane', minHeight: 32, flexDirection: 'column', justifyContent: 'space-between', children: [
        Text({ children: ['AIKYA FLOW'] }),
        Box({ key: 'aikya-mods-footer', flexDirection: 'column', flexShrink: 0 }),
      ] })
    })
  } }],
}, async ($, on) => {
  engineStubs(on)
  mock.clock(on)
  const ui = await $.ui.mount({ ...pane, requestId: 'aikya-flow', surface: 'terminal', props: { ...pane.props, placement: 'dock', scroll: { offset: 0, bodyRows: 32 } } })
  const footer = await ui.find({ key: 'aikya-mods-footer' })
  expect(JSON.stringify(footer)).toMatch('AIKYA BOXBOT')
  await ui.unmount()
})

test('the conveyor is visible without a decorative disclaimer in its pane', async ($, on) => {
  engineStubs(on)
  mock.clock(on)
  await $.command.run({ command: 'aikya-boxbot', args: 'still' })
  const ui = await $.ui.mount({ ...pane, surface: 'terminal' })
  expect(await ui.find({ type: 'Code' })).toBeDefined()
  expect(JSON.stringify(await ui.drawn())).not.toMatch('Decorative animation. No task progress is measured.')
  await ui.unmount()
})
