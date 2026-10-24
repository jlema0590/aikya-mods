import { expect, mock, test } from 'claude-code/testing'
import { executionIdentity } from '../lib/snapshot.js'

const pane = { plugin: 'aikya-flow', component: 'Pane' as const, requestId: 'aikya-flow', surface: 'terminal' as const, props: { title: 'Aikya Mods', placement: 'dock' as const, bodyColumns: 38 }, viewport: { columns: 160, rows: 50, isFullscreen: true } }
const identity = '119b4be80ee23dc5e7bfb2d94fa27f571a61ecb6845056d9dc0732d6a4529161'
function rawSnapshot() {
  const phases = Object.fromEntries(['explore','plan','implement','validate','security','review'].map(id => [id, { status: 'pending', reason: '', evidence: [], actors: {} }]))
  phases.plan = { status: 'waiting', reason: 'Approval required', evidence: [], actors: {} }
  return { schema: 1, identity, run_id: 'r1', command: 'aikya-feature', status: 'waiting', revision: 3, candidate_generation: 1, started_at: 0, updated_at: 0, phases }
}
function engine(on, options = {}) {
  const clock = mock.clock(on)
  const opens = []
  const files = options.files || {}
  on('command.register', () => ({ value: undefined }))
  on('session.start', () => ({ cwd: '/work' }))
  on('session.cwd', () => ({ value: '/work' }))
  on('session.id', async () => ({ value: options.sessionId ? await options.sessionId() : 's' }))
  on('session.end', () => ({ sessionId: 's' }))
  on('ui.open', ($, e) => { opens.push(e); return { value: { isPlaced: true } } })
  on('ui.close', () => ({ value: undefined }))
  on('ui.render', () => ({ type: 'Box', props: {}, children: [] }))
  on('command.run', ($, e) => ({ text: 'Original ' + e.command, context: ['original context'] }))
  on('skill.prompt', ($, e) => ({ text: e.text }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('tool.call', () => options.toolResult || { result: 'unchanged tool output' })
  on('fs.stat', ($, e) => ({ value: { kind: e.path === '/work' || e.path === '/cache' ? 'directory' : 'file', size: 500, mtimeMs: 0, isLink: false, realPath: e.path } }))
  on('fs.read', ($, e) => {
    if (!(e.path in files)) throw new Error('ENOENT')
    return { value: JSON.stringify(files[e.path]) }
  })
  return { clock, opens, files }
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
