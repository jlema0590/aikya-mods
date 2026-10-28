import { createFlow, normalizeCommand, beginRun, observeSkill, endTurn, phaseRows, LABELS, SYMBOLS, clean } from '../lib/flow.js';
import { acceptSnapshot, executionIdentity } from '../lib/snapshot.js';
import { phaseView } from '../lib/view.js';
import { FRAME_MS, motionFrame, transitionEmphasis } from '../lib/motion.js';
import { validateIndex, selectExecution, executionLabel } from '../lib/bridge.js';

const PANE = 'aikya-flow';
function stop(state) { if (state.timer) state.timer.cancel(); state.timer = null; state.timerMs = null; }
function nativeActive(state) { return state.flow.running && state.flow.status === 'Running' && !state.flow.activity.startsWith('Waiting for permission'); }
function moving(state) { return !state.still && !state.motionBlocked && (nativeActive(state) || phaseRows(state.flow).some(row => row.status === 'running') || !!state.emphasis); }
async function readJson($, path) {
  const info = await $.fs.stat(path);
  if (info.kind !== 'file' || info.isLink || info.size > 2000000) throw new Error('Invalid execution file');
  const text = await $.fs.read(path);
  if (typeof text !== 'string' || text.length > 2000000) throw new Error('Invalid execution file');
  return JSON.parse(text);
}
async function initialize($, state) {
  if (state.origin) return;
  try {
    const info = await $.fs.stat(await $.session.cwd(), { resolve: true });
    const session = await $.session.id();
    const configured = await $.env.get('AIKYA_EXECUTION_CACHE');
    const config = await $.env.get('CLAUDE_CONFIG_DIR');
    const home = await $.env.get('HOME') || await $.env.get('USERPROFILE');
    if (!info.realPath || !session || session === 'local' || (!configured && !config && !home)) throw new Error('Bridge disconnected');
    state.origin = { root: info.realPath, session, identity: await executionIdentity(info.realPath, session) };
    if (state.auto) state.cacheRoot = configured || (config || home + '/.claude') + '/aikya-execution';
    if (!state.ownsCache) state.originalCache = configured;
    if (!configured && state.auto) { await $.env.set('AIKYA_EXECUTION_CACHE', state.cacheRoot); state.ownsCache = state.cacheRoot; }
  } catch { state.diagnostic = 'Bridge disconnected'; }
}
async function startInvocation($, state, command) {
  await initialize($, state);
  beginRun(state.flow, command, await $.clock.now());
  state.motionBlocked = false; state.emphasis = null; state.runs = []; state.selected = null; state.accepted = new Map();
  if (state.auto && state.origin && state.cacheRoot) {
    const token = crypto.randomUUID().replace(/-/g, '');
    state.bridge = { schema: 1, identity: state.origin.identity, origin_root: state.origin.root, session_id: state.origin.session,
      invocation_id: token, command, cache_root: state.cacheRoot };
    await $.env.set('AIKYA_FLOW_CONTEXT', JSON.stringify(state.bridge));
    state.diagnostic = 'Waiting for execution';
  }
  $.ui.invalidate('ui.render');
  sync($, state);
}
async function readBridge($, state, flow) {
  const bridge = state.bridge;
  const acceptedRuns = state.accepted;
  if (!bridge) return { snapshot: null, runs: [], selected: null, diagnostic: 'Waiting for command' };
  let raw;
  try { raw = await readJson($, state.cacheRoot + '/' + bridge.identity + '/flow-' + bridge.invocation_id + '.json'); }
  catch (error) { return { snapshot: null, runs: [], selected: null, diagnostic: error instanceof SyntaxError ? 'Invalid execution index' : 'Waiting for execution' }; }
  const entries = validateIndex(raw, bridge);
  if (!entries) return { snapshot: null, runs: [], selected: null, diagnostic: raw && typeof raw === 'object' && raw.session_id && raw.session_id !== bridge.session_id ? 'Session mismatch' : 'Invalid execution index' };
  const runs = [];
  for (const entry of entries) {
    let accepted;
    try {
      const record = await readJson($, state.cacheRoot + '/' + entry.identity + '/' + entry.run_id + '.json');
      const previous = acceptedRuns.get(entry.identity + ':' + entry.run_id);
      accepted = acceptSnapshot(record, { identity: entry.identity, runId: entry.run_id, command: flow.command,
        invocationId: bridge.invocation_id, previous });
    } catch { /* Report an unavailable execution without substituting another run's evidence. */ }
    if (!accepted) return { snapshot: null, runs: [], selected: null, diagnostic: 'Execution unavailable or mismatched' };
    acceptedRuns.set(entry.identity + ':' + entry.run_id, accepted);
    runs.push({ ...accepted, ...entry });
  }
  const selected = selectExecution(runs);
  return { snapshot: selected, selected, runs, diagnostic: selected ? 'Connected' : 'Waiting for execution' };
}
async function refresh($, state) {
  if (!state.cacheRoot || state.busy) return;
  state.busy = true;
  const flow = state.flow, epoch = flow.epoch, sourceEpoch = state.sourceEpoch, cacheRoot = state.cacheRoot;
  const currentRead = () => flow === state.flow && epoch === flow.epoch && sourceEpoch === state.sourceEpoch;
  try {
    let snapshot;
    if (state.auto) {
      const result = await readBridge($, state, flow);
      if (!currentRead()) return;
      state.runs = result.runs; state.selected = result.selected; state.diagnostic = result.diagnostic;
      snapshot = result.snapshot;
    } else {
      let context = state.context;
      if (!context) {
        const cwd = await $.session.cwd();
        const info = await $.fs.stat(cwd, { resolve: true });
        if (typeof info.realPath !== 'string') throw new Error('Project path unavailable');
        context = { identity: await executionIdentity(info.realPath, await $.session.id()) };
        if (!currentRead()) return;
        state.context = context;
      }
      const folder = cacheRoot + '/' + context.identity;
      const active = await readJson($, folder + '/active.json');
      if (typeof active?.run_id !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(active.run_id)) throw new Error('Invalid execution id');
      const raw = await readJson($, folder + '/' + active.run_id + '.json');
      const current = await readJson($, folder + '/active.json');
      if (!currentRead()) return;
      snapshot = current?.run_id === active.run_id ? acceptSnapshot(raw, { ...context, runId: active.run_id, command: flow.command,
        minStartedAt: flow.startedAt, blockedRunId: flow.blockedRunId, previous: flow.snapshot }) : null;
      state.diagnostic = snapshot ? 'Connected' : 'Execution unavailable or mismatched';
    }
    const now = await $.clock.now();
    if (!currentRead()) return;
    const previous = flow.snapshot;
    const changed = previous && snapshot && previous.phases.some(row => row.status !== snapshot.phases.find(item => item.id === row.id)?.status);
    if (!snapshot || previous?.runId !== snapshot.runId || previous?.generation !== snapshot.generation) state.emphasis = null;
    else if (changed) state.emphasis = state.still || state.motionBlocked ? null : { previous, current: snapshot, at: now, epoch };
    flow.snapshot = snapshot;
    if (snapshot && !flow.command) flow.command = snapshot.command;
  } catch {
    if (currentRead()) { flow.snapshot = null; state.emphasis = null; state.diagnostic = 'Execution unavailable or mismatched'; }
  } finally {
    state.busy = false;
    sync($, state);
    $.ui.invalidate('ui.render');
  }
}
function sync($, state) {
  if (state.emphasis?.epoch !== state.flow.epoch) state.emphasis = null;
  const period = state.visible ? moving(state) ? FRAME_MS : state.cacheRoot ? 2000 : null : null;
  if (state.timer && period === state.timerMs) return;
  stop(state);
  if (!period) return;
  state.timerMs = period;
  state.timer = $.clock.every(period, async () => {
    const now = await $.clock.now();
    if (!state.visible) return;
    const animated = moving(state);
    if (state.emphasis && now - state.emphasis.at >= FRAME_MS) state.emphasis = null;
    if (animated) { state.frame = (state.frame + 1) % 4; $.ui.invalidate('ui.render'); }
    state.pollElapsed += period;
    if (state.cacheRoot && state.pollElapsed >= 2000) { state.pollElapsed = 0; await refresh($, state); }
    sync($, state);
  });
}
async function open($, state) {
  const placement = await $.ui.open({ id: PANE, title: 'Aikya Mods', columns: 44, rows: 20, closeOnEscape: true });
  state.visible = placement?.isPlaced !== false;
  state.hidden = false;
  sync($, state);
}
function status(flow, state) {
  const rows = phaseRows(flow);
  return ['AIKYA FLOW', ...(flow.command ? ['Command: /' + flow.command] : []),
    'Native activity: ' + flow.status + (flow.activity ? ' · ' + flow.activity : ''),
    'Source: ' + (flow.snapshot ? 'Aikya execution snapshot' : 'Native activity; phase evidence unavailable'),
    'Bridge: ' + state.diagnostic,
    ...state.runs.map((run, index) => 'Execution ' + (index + 1) + ': ' + executionLabel(run) + ' · ' + run.status + ' · ' + run.runId),
    ...rows.map(row => `${SYMBOLS[row.status]} ${row.label}: ${LABELS[row.status]}${row.reason ? ' — ' + row.reason : ''}`)].join('\n');
}
export function register(on) {
  const state = { flow: createFlow(), visible: false, hidden: false, timer: null, cacheRoot: null, context: null, busy: false, sourceEpoch: 0, frame: 0, still: false, emphasis: null, motionBlocked: false, timerMs: null, pollElapsed: 0 };
  Object.assign(state, { auto: true, origin: null, bridge: null, runs: [], accepted: new Map(), selected: null, diagnostic: 'Waiting for command' });
  on('session.start', async ($, e, next) => {
    await initialize($, state);
    await $.command.register({ name: 'aikya-flow', description: 'Show command activity and evidence-backed workflow states', argumentHint: '[show|hide|status|still|motion|connect <cache-root|auto>|disconnect]', immediate: true });
    if (e.isInteractive && e.surface) await open($, state);
    return next(e);
  });
  on('command.run', { command: 'aikya-flow' }, async ($, e) => {
    const args = e.args.trim();
    if (args === 'hide') { state.hidden = true; state.visible = false; stop(state); await $.ui.close({ id: PANE }); return {}; }
    if (args === 'still' || args === 'motion') { state.still = args === 'still'; state.emphasis = null; sync($, state); $.ui.invalidate('ui.render'); return {}; }
    if (args === 'disconnect') { state.sourceEpoch += 1; state.auto = false; state.bridge = null; state.runs = []; state.selected = null; state.diagnostic = 'Bridge disconnected'; state.cacheRoot = null; state.context = null; state.flow.snapshot = null; state.emphasis = null; await $.env.set('AIKYA_FLOW_CONTEXT', undefined); sync($, state); $.ui.invalidate('ui.render'); return {}; }
    if (args === 'connect auto') {
      state.auto = true; state.origin = null; state.sourceEpoch += 1;
      await initialize($, state);
      if (state.flow.command) await startInvocation($, state, state.flow.command);
      return { text: 'Automatic bridge enabled. Run an Aikya command to receive execution states.' };
    }
    if (args.startsWith('connect ')) {
      const path = args.slice(8).trim();
      try {
        const info = await $.fs.stat(path, { resolve: true });
        if (info.kind !== 'directory' || typeof info.realPath !== 'string') return { text: 'The execution cache must be an existing local directory.' };
        state.cacheRoot = info.realPath.replace(/\/$/, '');
        state.auto = false; state.bridge = null; state.runs = []; state.selected = null;
        await $.env.set('AIKYA_FLOW_CONTEXT', undefined);
        state.sourceEpoch += 1;
        state.context = null;
        state.pollElapsed = 0; state.emphasis = null;
        await refresh($, state);
        sync($, state);
        return { text: state.flow.snapshot ? 'Connected to the current Aikya execution snapshot.' : 'Cache connected. No matching execution snapshot is available yet.' };
      } catch { return { text: 'Unable to read that execution cache directory.' }; }
    }
    if (args === 'status') { await refresh($, state); return { text: status(state.flow, state) }; }
    if (args && args !== 'show') return { text: 'Usage: /aikya-flow [show|hide|status|still|motion|connect <cache-root|auto>|disconnect]' };
    await refresh($, state);
    await open($, state);
    return {};
  });
  on('prompt.submit', async ($, e, next) => {
    const command = e.text.trim().startsWith('/') ? normalizeCommand(e.text.trim()) : null;
    if (command) { await startInvocation($, state, command); state.preparedCommand = command; }
    return next(e);
  });
  on('command.run', async ($, e, next) => {
    const command = normalizeCommand(e.command);
    if (!command) return next(e);
    if (state.preparedCommand !== command) await startInvocation($, state, command);
    state.preparedCommand = null;
    const epoch = state.flow.epoch;
    const result = await next(e);
    if (epoch === state.flow.epoch) {
      if (state.flow.pendingTurn) { state.flow.status = 'Command returned'; state.flow.activity = 'Waiting for native turn or execution evidence'; }
      await refresh($, state);
      $.ui.invalidate('ui.render');
    }
    return result;
  });
  on('skill.prompt', async ($, e, next) => {
    const command = normalizeCommand(e.skill);
    if (command) {
      if (!state.flow.command) await startInvocation($, state, command);
      else observeSkill(state.flow, command, await $.clock.now());
      $.ui.invalidate('ui.render');
    }
    return next(e);
  });
  on('turn.start', async ($, e, next) => {
    state.preparedCommand = null;
    if (!state.flow.pendingTurn && !state.bridge) beginRun(state.flow, normalizeCommand(e.text.startsWith('/') ? e.text : ''), await $.clock.now());
    state.motionBlocked = false; state.emphasis = null;
    state.flow.pendingTurn = false;
    state.flow.status = 'Running';
    state.flow.running = true;
    state.flow.turnId = e.turnId;
    state.flow.activity = 'Thinking';
    if (!state.hidden && !state.visible) await open($, state);
    $.ui.invalidate('ui.render');
    return next(e);
  });
  on('tool.call', async ($, e, next) => {
    const epoch = state.flow.epoch;
    const name = clean(e.tool);
    if (state.flow.running) { state.flow.activity = 'Tool running: ' + name; state.flow.toolCount += 1; $.ui.invalidate('ui.render'); }
    const result = await next(e);
    if (epoch === state.flow.epoch && state.flow.running) {
      state.flow.activity = (result.deny ? 'Denied: ' : result.isError ? 'Tool failed: ' : 'Tool finished: ') + name;
      await refresh($, state);
      $.ui.invalidate('ui.render');
    }
    return result;
  });
  on('tool.check', async ($, e, next) => {
    const result = await next(e);
    if (state.flow.running && result.decision === 'ask') { state.flow.activity = 'Waiting for permission: ' + clean(e.tool); $.ui.invalidate('ui.render'); }
    return result;
  });
  on('turn.complete', async ($, e, next) => {
    endTurn(state.flow, e);
    if (!e.agentId && state.flow.turnId === e.turnId && ['Interrupted','Error','Refused'].includes(state.flow.status)) { state.motionBlocked = true; state.emphasis = null; }
    if (!e.agentId) await refresh($, state);
    $.ui.invalidate('ui.render');
    return next(e);
  });
  on('ui.close', { id: PANE }, async ($, e, next) => { state.visible = false; state.hidden = true; stop(state); return next(e); });
  on('session.end', async ($, e, next) => {
    stop(state); state.visible = false; state.hidden = false; state.sourceEpoch += 1; state.flow = createFlow(); state.context = null; state.emphasis = null; state.motionBlocked = false; state.pollElapsed = 0;
    state.bridge = null; state.origin = null; state.runs = []; state.selected = null; state.preparedCommand = null;
    await $.env.set('AIKYA_FLOW_CONTEXT', undefined);
    if (state.ownsCache && await $.env.get('AIKYA_EXECUTION_CACHE') === state.ownsCache) await $.env.set('AIKYA_EXECUTION_CACHE', state.originalCache);
    state.ownsCache = null;
    return next(e);
  });
  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    if (e.requestId !== PANE) { state.visible = false; stop(state); return next(e); }
    if (!state.hidden && !state.visible) { state.visible = true; sync($, state); }
    sync($, state);
    const now = await $.clock.now();
    const { Box, Text } = $.ui.resolve(e);
    const rows = phaseRows(state.flow);
    const view = phaseView(rows, { bodyColumns: e.props.bodyColumns, bodyRows: e.props.scroll?.bodyRows, placement: e.props.placement });
    const highlight = !state.still && !state.motionBlocked && state.emphasis
      ? transitionEmphasis(state.emphasis.previous, state.emphasis.current, state.emphasis.at, now) : { phaseIds: [], connectorIds: [] };
    const spinner = motionFrame({ nativeRunning: nativeActive(state), still: state.still || state.motionBlocked, frame: state.frame });
    const content = [Text({ bold: true, children: ['AIKYA FLOW'] })];
    if (state.flow.command) content.push(Text({ wrap: 'truncate-end', children: ['/' + state.flow.command] }));
    if (state.flow.status !== 'Turn ended') content.push(Text({ color: 'cyan', wrap: 'truncate-end',
      children: [(nativeActive(state) ? spinner.symbol + ' ' : '') + state.flow.status + (state.flow.activity ? ' · ' + state.flow.activity : '')] }));
    content.push(Text({ dimColor: true, wrap: 'truncate-end', children: [state.flow.snapshot ? 'Source: Aikya execution snapshot' : state.diagnostic] }));
    if (state.selected) content.push(Text({ wrap: 'truncate-end', children: [executionLabel(state.selected) + ' · ' + (state.runs.indexOf(state.selected) + 1) + '/' + state.runs.length] }));
    const reason = rows.find(row => row.reason);
    if (reason) content.push(Text({ dimColor: true, wrap: 'truncate-end', children: [reason.label + ': ' + reason.reason] }));
    const diagram = [];
    view.nodes.forEach((node, index) => {
      const symbol = motionFrame({ phaseStatus: node.status, still: state.still || state.motionBlocked, frame: state.frame }).symbol;
      const label = Text({ wrap: 'truncate-end', children: [node.label + (view.mode === 'compact' ? ' ' : '')] });
      const statusText = Text({ color: node.color, bold: highlight.phaseIds.includes(node.id), wrap: 'truncate-end', children: [symbol + ' ' + node.stateLabel] });
      diagram.push(Box({ key: 'phase-' + node.id, width: view.width, flexDirection: view.mode === 'cards' ? 'column' : 'row',
        alignItems: view.mode === 'cards' ? 'center' : undefined, borderStyle: view.mode === 'cards' ? 'round' : undefined,
        borderColor: node.color, flexShrink: 0, children: [label, statusText] }));
      const nextNode = view.nodes[index + 1];
      if (nextNode) diagram.push(Box({ key: 'connector-' + node.id, width: view.width, justifyContent: 'center', flexShrink: 0, children: [
        Text({ color: node.status === 'completed' && nextNode.status === 'completed' ? 'success' : nextNode.status === 'running' ? 'cyan' : 'inactive',
          bold: highlight.connectorIds.includes(node.id), children: ['↓'] }),
      ] }));
    });
    content.push(Box({ key: 'phase-diagram', flexDirection: 'column', alignItems: 'center', children: diagram }));
    if (e.surface === 'terminal' && e.props.placement === 'inline') content.push(Text({ dimColor: true, children: ['Use a wider fullscreen terminal for side-by-side panes.'] }));
    const theirs = await next(e);
    const bodyRows = e.props.scroll?.bodyRows;
    const minHeight = e.props.placement === 'dock' && Number.isFinite(bodyRows) && bodyRows > 0 ? bodyRows : undefined;
    return Box({ key: 'aikya-mods-pane', flexDirection: 'column', rowGap: 0, minHeight, justifyContent: 'space-between', children: [
      Box({ key: 'aikya-flow-content', flexDirection: 'column', flexShrink: 0, children: content }),
      // The original Pane body is empty. Its opaque host drawing cannot be
      // nested under a sized Box; only other mods' own trees belong here.
      Box({ key: 'aikya-mods-footer', flexDirection: 'column', flexShrink: 0, children: theirs?.type === 'engine' ? [] : [theirs] }),
    ] });
  });
}
