import { expect, mock, test } from 'claude-code/testing'
import { executionIdentity } from '../lib/snapshot.js'

const pane = { plugin: 'aikya-flow', component: 'Pane' as const, requestId: 'aikya-flow', surface: 'terminal' as const, props: { title: 'Aikya Mods', placement: 'dock' as const, bodyColumns: 38 }, viewport: { columns: 160, rows: 50, isFullscreen: true } }
const identity = '119b4be80ee23dc5e7bfb2d94fa27f571a61ecb6845056d9dc0732d6a4529161'
function rawSnapshot() {
  const phases = Object.fromEntries(['explore','plan','implement','validate','security','review'].map(id => [id, { status: 'pending', reason: '', evidence: [], actors: {} }]))
  phases.plan = { status: 'waiting', reason: 'Approval required', evidence: [], actors: {} }
  return { schema: 1, identity, run_id: 'r1', command: 'aikya-feature', status: 'waiting', revision: 3, candidate_generation: 1, started_at: 0, updated_at: 0, phases }
}
function fixturePath(value) {
  // Claude normalizes absolute paths before the filesystem boundary on Windows.
  // These two virtual fixture roots keep the same identity on every test host.
  return value.replace(/\\/g, '/').replace(/^[A-Za-z]:(?=\/(?:work|cache)(?:\/|$))/, '')
}
function engine(on, options = {}) {
  const clock = mock.clock(on)
  const opens = []
  const files = options.files || {}
  const env = { AIKYA_EXECUTION_CACHE: '/cache', ...options.env }
  on('env.get', ($, e) => ({ value: env[e.name] }))
  on('env.set', ($, e) => { env[e.name] = e.value; return { value: undefined } })
  on('command.register', () => ({ value: undefined }))
  on('session.start', () => ({ cwd: '/work' }))
  on('session.cwd', () => ({ value: '/work' }))
  on('session.id', async () => ({ value: options.sessionId ? await options.sessionId() : 's' }))
  on('session.end', () => ({ sessionId: 's' }))
  on('ui.open', ($, e) => { opens.push(e); return { value: { isPlaced: true } } })
  on('ui.close', () => ({ value: undefined }))
  on('ui.render', () => options.nativeDrawing ? ({ type: 'engine', ref: 0 }) : ({ type: 'Box', props: {}, children: [] }))
  on('command.run', ($, e) => ({ text: 'Original ' + e.command, context: ['original context'] }))
  on('skill.prompt', ($, e) => ({ text: e.text }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('tool.call', () => options.toolResult || { result: 'unchanged tool output' })
  on('fs.stat', ($, e) => {
    const path = fixturePath(e.path)
    return { value: { kind: path === '/work' || path === '/cache' ? 'directory' : 'file', size: 500, mtimeMs: 0, isLink: false, realPath: path } }
  })
  on('fs.read', ($, e) => {
    if (options.onRead) options.onRead()
    const path = fixturePath(e.path)
    if (!(path in files)) throw new Error('ENOENT')
    return { value: JSON.stringify(files[path]) }
  })
  return { clock, opens, files, env }
}

test('Flow opens the side pane at interactive startup without requesting keyboard focus', async ($, on) => {
  const { opens } = engine(on)
  await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })
  expect(opens.length).toBe(1)
  expect(opens[0]).toMatchObject({ id: 'aikya-flow', title: 'Aikya Mods' })
  expect(opens[0].focus).toBeUndefined()
})
test('a headless session registers Flow without opening a pane', async ($, on) => {
  const { opens } = engine(on)
  await $.session.start({ cwd: '/work', surface: null, isInteractive: false })
  expect(opens.length).toBe(0)
  const result = await $.command.run({ command: 'aikya-flow', args: 'status' })
  expect(result.text).toMatch('AIKYA FLOW')
})
test('command and tool results pass through unchanged and tool success never completes a phase', async ($, on) => {
  engine(on)
  const command = await $.command.run({ command: 'aikya-feature', args: 'private argument' })
  expect(command).toMatchObject({ text: 'Original aikya-feature', context: ['original context'] })
  await $.turn.start({ turnId: 't', text: 'private prompt' })
  const result = await $.tool.call({ tool: 'Edit', file_path: 'example.ts', old_string: 'a', new_string: 'b' })
  expect(result).toMatchObject({ result: 'unchanged tool output' })
  await $.turn.complete({ turnId: 't', answer: 'original answer', reason: 'answer', durationMs: 1, isAborted: false })
  const status = await $.command.run({ command: 'aikya-flow', args: 'status' })
  expect(status.text).toMatch('/aikya-feature')
  expect(status.text).toMatch('No evidence')
  expect(status.text).not.toMatch('Completed')
  expect(status.text).not.toMatch('private')
})
test('a denied tool is reported as native activity without changing the refusal', async ($, on) => {
  engine(on, { toolResult: { deny: 'Original refusal' } })
  await $.turn.start({ turnId: 't', text: 'test' })
  expect(await $.tool.call({ tool: 'Bash', command: 'example' })).toMatchObject({ deny: 'Original refusal' })
  const status = await $.command.run({ command: 'aikya-flow', args: 'status' })
  expect(status.text).toMatch('Denied')
})
test('Flow validates native element trees on terminal, Desktop and VS Code', async ($, on) => {
  engine(on)
  await $.command.run({ command: 'aikya-bugfix', args: '' })
  for (const surface of ['terminal','desktop','vscode'] as const) {
    const ui = await $.ui.mount({ ...pane, surface })
    expect(JSON.stringify(await ui.drawn())).toMatch('Regression')
    expect(JSON.stringify(await ui.drawn())).toMatch('No evidence')
    await ui.unmount()
  }
})
test('connected snapshots show evidence states, refresh on a timer and stop refreshing when hidden', async ($, on) => {
  const path = '/cache/' + identity
  const { clock, files } = engine(on, { files: { [path + '/active.json']: { run_id: 'r1' }, [path + '/r1.json']: rawSnapshot() } })
  await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'aikya-flow', args: 'connect /cache' })
  const ui = await $.ui.mount(pane)
  expect(JSON.stringify(await ui.drawn())).toMatch('Approval required')
  files[path + '/r1.json'].phases.plan = { status: 'running', reason: '', evidence: [], actors: {} }
  files[path + '/r1.json'].revision = 4
  await clock.advance(2000)
  expect(JSON.stringify(await ui.drawn())).not.toMatch('Approval required')
  await $.command.run({ command: 'aikya-flow', args: 'hide' })
  files[path + '/r1.json'].phases.plan = { status: 'waiting', reason: 'Should stay hidden', evidence: [], actors: {} }
  files[path + '/r1.json'].revision = 5
  await clock.advance(6000)
  expect(JSON.stringify(await ui.drawn())).not.toMatch('Should stay hidden')
  await ui.unmount()
})
test('cache identity matches the existing Python Aikya contract', async () => {
  expect(await executionIdentity('/work', 's')).toBe(identity)
})
test('a cache read started before session end cannot restore the old session snapshot', async ($, on) => {
  let release, reached
  const blocked = new Promise(resolve => { release = resolve })
  const requested = new Promise(resolve => { reached = resolve })
  const path = '/cache/' + identity
  engine(on, { sessionId: async () => { reached(); await blocked; return 's' }, files: { [path + '/active.json']: { run_id: 'r1' }, [path + '/r1.json']: rawSnapshot() } })
  const connecting = $.command.run({ command: 'aikya-flow', args: 'connect /cache' })
  await requested
  await $.session.end({ reason: 'resume', sessionId: 's', resume: { id: 's' } })
  release()
  const result = await connecting
  expect(result.text).not.toMatch('Connected to the current')
})

test('a local command can return without claiming an ongoing model turn or verified phase', async ($, on) => {
  engine(on)
  await $.command.run({ command: 'aikya-tokens', args: '' })
  const returned = await $.command.run({ command: 'aikya-flow', args: 'status' })
  expect(returned.text).toMatch('Native activity: Command returned')
  expect(returned.text).not.toMatch('Completed')
  await $.turn.start({ turnId: 'follow-up', text: 'continue' })
  const started = await $.command.run({ command: 'aikya-flow', args: 'status' })
  expect(started.text).toMatch('Native activity: Running')
})

for (const rows of [18, 36]) {
  test('the dock reserves its measured height with a footer after Flow (' + rows + ' rows)', async ($, on) => {
    engine(on)
    const ui = await $.ui.mount({ ...pane, props: { ...pane.props, scroll: { offset: 0, bodyRows: rows } } })
    const drawing = await ui.drawn()
    expect(drawing.props.key).toBe('aikya-mods-pane')
    expect(drawing.props.minHeight).toBe(rows)
    expect(drawing.props.justifyContent).toBe('space-between')
    expect(drawing.children[0].props.key).toBe('aikya-flow-content')
    const footer = await ui.find({ key: 'aikya-mods-footer' })
    expect(footer.props.flexShrink).toBe(0)
    await ui.unmount()
  })
}

test('the inline Flow pane keeps a compact footer without filling the terminal', async ($, on) => {
  engine(on)
  const ui = await $.ui.mount({ ...pane, surface: 'terminal', props: { ...pane.props, placement: 'inline', scroll: { offset: 0, bodyRows: 12 } }, viewport: { columns: 80, rows: 60, isFullscreen: false } })
  const drawing = await ui.drawn()
  expect(drawing.props.minHeight).toBeUndefined()
  expect(JSON.stringify(drawing)).toMatch('AIKYA FLOW')
  expect(await ui.find({ key: 'aikya-mods-footer' })).toBeDefined()
  await ui.unmount()
})

test('a full-height Flow frame does not wrap the original host drawing', async ($, on) => {
  engine(on, { nativeDrawing: true })
  const ui = await $.ui.mount({ ...pane, props: { ...pane.props, scroll: { offset: 0, bodyRows: 32 } } })
  expect(JSON.stringify(await ui.drawn())).not.toMatch('"type":"engine"')
  expect(await ui.find({ key: 'aikya-mods-footer' })).toBeDefined()
  await ui.unmount()
})

test('the idle dock draws six cards without placeholder task or turn summary text', async ($, on) => {
  engine(on)
  const ui = await $.ui.mount({ ...pane, props: { ...pane.props, scroll: { offset: 0, bodyRows: 46 } } })
  const drawing = JSON.stringify(await ui.drawn())
  expect(drawing).not.toMatch('Claude task')
  expect(drawing).not.toMatch('Native turn turn ended')
  for (const id of ['explore','plan','implement','validate','security','review']) expect(await ui.find({ key: 'phase-' + id })).toBeDefined()
  expect(await ui.find({ key: 'connector-explore' })).toBeDefined()
  await ui.unmount()
})

test('a finished native turn leaves the cards visible without its verbose activity banner', async ($, on) => {
  engine(on)
  const ui = await $.ui.mount(pane)
  await $.turn.start({ turnId: 't', text: 'test' })
  await $.turn.complete({ turnId: 't', answer: 'done', durationMs: 1, isAborted: false, reason: 'answer' })
  const drawing = JSON.stringify(await ui.drawn())
  expect(drawing).not.toMatch('Turn ended')
  expect(drawing).not.toMatch('phase evidence is separate')
  expect(await ui.find({ key: 'phase-review' })).toBeDefined()
  await ui.unmount()
})

test('native activity animates only its header and still/motion never invent phase evidence', async ($, on) => {
  const { clock } = engine(on)
  await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount(pane)
  await $.turn.start({ turnId: 't', text: 'test' })
  const first = JSON.stringify(await ui.drawn())
  await clock.advance(250)
  expect(JSON.stringify(await ui.drawn())).not.toBe(first)
  expect((await ui.find({ key: 'phase-explore' })).text).toMatch('? No evidence')
  await $.command.run({ command: 'aikya-flow', args: 'still' })
  const still = JSON.stringify(await ui.drawn())
  await clock.advance(1000)
  expect(JSON.stringify(await ui.drawn())).toBe(still)
  await $.command.run({ command: 'aikya-flow', args: 'motion' })
  const moving = JSON.stringify(await ui.drawn())
  await clock.advance(250)
  expect(JSON.stringify(await ui.drawn())).not.toBe(moving)
  await $.turn.complete({ turnId: 't', answer: 'done', durationMs: 1, isAborted: true, reason: 'aborted' })
  const interrupted = JSON.stringify(await ui.drawn())
  await clock.advance(1000)
  expect(JSON.stringify(await ui.drawn())).toBe(interrupted)
  await ui.unmount()
})

test('animation frames preserve two-second cache reads and closing cancels work', async ($, on) => {
  const path = '/cache/' + identity
  const raw = rawSnapshot(); raw.phases.plan = { status: 'running', reason: '', evidence: [], actors: {} }
  let reads = 0
  const { clock } = engine(on, { files: { [path + '/active.json']: { run_id: 'r1' }, [path + '/r1.json']: raw }, onRead: () => { reads += 1 } })
  await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'aikya-flow', args: 'connect /cache' })
  const ui = await $.ui.mount(pane)
  const initialReads = reads
  const initial = JSON.stringify(await ui.drawn())
  await clock.advance(1750)
  expect(reads).toBe(initialReads)
  expect(JSON.stringify(await ui.drawn())).not.toBe(initial)
  await clock.advance(250)
  expect(reads).toBe(initialReads + 3)
  await $.command.run({ command: 'aikya-flow', args: 'hide' })
  const closedReads = reads
  await clock.advance(4000)
  expect(reads).toBe(closedReads)
  await ui.unmount()
})

test('a confirmed handoff emphasizes once and still mode continues receiving phase updates', async ($, on) => {
  const path = '/cache/' + identity
  const raw = rawSnapshot(); raw.phases.plan = { status: 'running', reason: '', evidence: [], actors: {} }
  const { clock } = engine(on, { files: { [path + '/active.json']: { run_id: 'r1' }, [path + '/r1.json']: raw } })
  await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'aikya-flow', args: 'connect /cache' })
  const ui = await $.ui.mount({ ...pane, props: { ...pane.props, scroll: { offset: 0, bodyRows: 46 } } })
  expect(JSON.stringify(await ui.find({ key: 'phase-plan' }))).not.toMatch('"bold":true')
  raw.phases.plan = { status: 'completed', reason: '', evidence: [{ check: 'sample plan', result: 'recorded' }], actors: {} }
  raw.phases.implement = { status: 'running', reason: '', evidence: [], actors: {} };raw.revision += 1
  await clock.advance(2000)
  expect(JSON.stringify(await ui.find({ key: 'phase-plan' }))).toMatch('"bold":true')
  expect(JSON.stringify(await ui.find({ key: 'connector-plan' }))).toMatch('"bold":true')
  await clock.advance(250)
  expect(JSON.stringify(await ui.find({ key: 'phase-plan' }))).not.toMatch('"bold":true')
  await clock.advance(2000)
  expect(JSON.stringify(await ui.find({ key: 'phase-plan' }))).not.toMatch('"bold":true')
  await $.command.run({ command: 'aikya-flow', args: 'still' })
  raw.phases.implement = { status: 'blocked', reason: 'Fixture dependency', evidence: [], actors: {} };raw.revision += 1
  await clock.advance(2000)
  expect((await ui.find({ key: 'phase-implement' })).text).toMatch('Blocked')
  expect(JSON.stringify(await ui.find({ key: 'phase-implement' }))).not.toMatch('"bold":true')
  await ui.unmount()
})

test('an unreadable execution cancels a confirmation instead of highlighting No evidence', async ($, on) => {
  const path = '/cache/' + identity
  const raw = rawSnapshot();raw.phases.plan = { status: 'running', reason: '', evidence: [], actors: {} }
  const { clock, files } = engine(on, { files: { [path + '/active.json']: { run_id: 'r1' }, [path + '/r1.json']: raw } })
  await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'aikya-flow', args: 'connect /cache' })
  const ui = await $.ui.mount(pane)
  raw.phases.plan = { status: 'completed', reason: '', evidence: [{ check: 'sample plan', result: 'recorded' }], actors: {} };raw.revision += 1
  await clock.advance(2000)
  expect(JSON.stringify(await ui.find({ key: 'phase-plan' }))).toMatch('"bold":true')
  delete files[path + '/r1.json']
  await $.command.run({ command: 'aikya-flow', args: 'status' })
  const phase = await ui.find({ key: 'phase-plan' })
  expect(phase.text).toMatch('No evidence')
  expect(JSON.stringify(phase)).not.toMatch('"bold":true')
  await ui.unmount()
})

test('automatic bridge follows a real worktree snapshot with an earlier hook start', async ($, on) => {
  const { clock, files, env } = engine(on)
  await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })
  await clock.advance(100)
  await $.command.run({ command: 'aikya-analyze', args: '' })
  const context = JSON.parse(env.AIKYA_FLOW_CONTEXT || '{}')
  expect(context.session_id).toBe('s')
  expect(context.origin_root).toBe('/work')
  const targetIdentity = await executionIdentity('/work/.claude/worktrees/analysis', 's')
  const raw = rawSnapshot()
  Object.assign(raw, { identity: targetIdentity, run_id: 'worktree-1', command: 'aikya-analyze', flow_invocation: context.invocation_id })
  raw.phases.explore = { status: 'running', reason: '', evidence: [], actors: {} }
  files['/cache/' + identity + '/flow-' + context.invocation_id + '.json'] = {
    schema: 1, identity, session_id: 's', invocation_id: context.invocation_id, command: 'aikya-analyze',
    runs: [{ identity: targetIdentity, run_id: 'worktree-1', mode: 'preview', focus: 'architecture' }],
  }
  files['/cache/' + targetIdentity + '/worktree-1.json'] = raw
  await clock.advance(2000)
  const result = await $.command.run({ command: 'aikya-flow', args: 'status' })
  expect(result.text).toMatch('Explore: Running')
  expect(result.text).toMatch('Architecture')
  expect(result.text).toMatch('Preview')
  await $.turn.start({ turnId: 't1', text: 'run analysis' })
  await $.turn.complete({ turnId: 't1', answer: 'waiting for background job', reason: 'answer', durationMs: 1, isAborted: false })
  await $.turn.start({ turnId: 't2', text: 'yes, continue' })
  expect(env.AIKYA_FLOW_CONTEXT).toBe(JSON.stringify(context))
  expect((await $.command.run({ command: 'aikya-flow', args: 'status' })).text).toMatch('/aikya-analyze')
})

test('a missing automatic bridge tells the user why phase states are unavailable', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'aikya-analyze', args: '' })
  const status = await $.command.run({ command: 'aikya-flow', args: 'status' })
  expect(status.text).toMatch('Waiting for execution')
  expect(status.text).not.toMatch('Completed')
})

test('a new explicit command isolates old work and a corrupt index reports a diagnostic', async ($, on) => {
  const { env, files } = engine(on)
  await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'aikya-analyze', args: '' })
  const old = JSON.parse(env.AIKYA_FLOW_CONTEXT)
  await $.command.run({ command: 'aikya-feature', args: '' })
  const current = JSON.parse(env.AIKYA_FLOW_CONTEXT)
  expect(current.invocation_id).not.toBe(old.invocation_id)
  files['/cache/' + identity + '/flow-' + current.invocation_id + '.json'] = { schema: 1, ...old, runs: [] }
  const result = await $.command.run({ command: 'aikya-flow', args: 'status' })
  expect(result.text).toMatch('/aikya-feature')
  expect(result.text).toMatch('Invalid execution index')
  expect(result.text).not.toMatch('Completed')
})

test('automatic snapshots cannot roll back a revision after an unreadable record', async ($, on) => {
  const { env, files } = engine(on)
  await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'aikya-analyze', args: '' })
  const bridge = JSON.parse(env.AIKYA_FLOW_CONTEXT)
  const indexPath = '/cache/' + identity + '/flow-' + bridge.invocation_id + '.json'
  const runPath = '/cache/' + identity + '/r1.json'
  files[indexPath] = { schema: 1, identity, session_id: 's', invocation_id: bridge.invocation_id, command: 'aikya-analyze', runs: [{ identity, run_id: 'r1', mode: 'preview', focus: 'architecture' }] }
  const raw = rawSnapshot()
  Object.assign(raw, { command: 'aikya-analyze', flow_invocation: bridge.invocation_id, revision: 5 })
  files[runPath] = raw
  expect((await $.command.run({ command: 'aikya-flow', args: 'status' })).text).toMatch('Plan: Waiting')
  delete files[runPath]
  expect((await $.command.run({ command: 'aikya-flow', args: 'status' })).text).toMatch('Execution unavailable')
  files[runPath] = { ...raw, revision: 4 }
  expect((await $.command.run({ command: 'aikya-flow', args: 'status' })).text).not.toMatch('Plan: Waiting')
})

test('a prompt and its command share a context and disconnect releases it', async ($, on) => {
  const { env } = engine(on)
  on('prompt.submit', ($, e) => ({ text: e.text }))
  await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: '/aikya-analyze --focus architecture' })
  const context = env.AIKYA_FLOW_CONTEXT
  await $.command.run({ command: 'aikya-analyze', args: '--focus architecture' })
  expect(env.AIKYA_FLOW_CONTEXT).toBe(context)
  await $.command.run({ command: 'aikya-flow', args: 'disconnect' })
  expect(env.AIKYA_FLOW_CONTEXT).toBeUndefined()
  expect((await $.command.run({ command: 'aikya-flow', args: 'status' })).text).toMatch('Bridge disconnected')
})

for (const environment of [
  { AIKYA_EXECUTION_CACHE: undefined, HOME: '/home/user', CLAUDE_CONFIG_DIR: undefined, USERPROFILE: undefined },
  { AIKYA_EXECUTION_CACHE: undefined, HOME: undefined, CLAUDE_CONFIG_DIR: undefined, USERPROFILE: 'C:/Users/Test User' },
  { AIKYA_EXECUTION_CACHE: undefined, HOME: '/home/user', CLAUDE_CONFIG_DIR: '/custom/config', USERPROFILE: undefined },
]) {
  test('automatic bridge propagates a private cache using available home/config paths ' + JSON.stringify(environment), async ($, on) => {
    const { env } = engine(on, { env: environment })
    await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })
    await $.command.run({ command: 'aikya-analyze', args: '' })
    const context = JSON.parse(env.AIKYA_FLOW_CONTEXT)
    expect(context.cache_root).toBe(env.AIKYA_EXECUTION_CACHE)
    expect(context.cache_root).toMatch('/aikya-execution')
    await $.session.end({ reason: 'exit', sessionId: 's' })
    expect(env.AIKYA_FLOW_CONTEXT).toBeUndefined()
    expect(env.AIKYA_EXECUTION_CACHE).toBeUndefined()
  })
}
