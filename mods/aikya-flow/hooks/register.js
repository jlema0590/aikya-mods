import { createFlow, normalizeCommand, beginRun, observeSkill, endTurn, phaseRows, LABELS, SYMBOLS, clean } from '../lib/flow.js';
import { acceptSnapshot, executionIdentity } from '../lib/snapshot.js';

const PANE = 'aikya-flow';
function stop(state) { if (state.timer) state.timer.cancel(); state.timer = null; }
async function readJson($, path) {
  const info = await $.fs.stat(path);
  if (info.kind !== 'file' || info.isLink || info.size > 2000000) throw new Error('Invalid execution file');
  const text = await $.fs.read(path);
  if (typeof text !== 'string' || text.length > 2000000) throw new Error('Invalid execution file');
  return JSON.parse(text);
}
async function refresh($, state) {
  if (!state.cacheRoot || state.busy) return;
  state.busy = true;
  const flow = state.flow, epoch = flow.epoch, sourceEpoch = state.sourceEpoch, cacheRoot = state.cacheRoot;
  const currentRead = () => flow === state.flow && epoch === flow.epoch && sourceEpoch === state.sourceEpoch;
  try {
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
    const snapshot = current?.run_id === active.run_id ? acceptSnapshot(raw, { ...context, runId: active.run_id, command: flow.command,
      minStartedAt: flow.startedAt, blockedRunId: flow.blockedRunId, previous: flow.snapshot }) : null;
    flow.snapshot = snapshot;
    if (snapshot && !flow.command) flow.command = snapshot.command;
  } catch {
    if (currentRead()) flow.snapshot = null;
  } finally {
    state.busy = false;
    $.ui.invalidate('ui.render');
  }
}
function sync($, state) {
  stop(state);
  if (state.visible && state.cacheRoot) state.timer = $.clock.every(2000, () => refresh($, state));
}
async function open($, state) {
  const placement = await $.ui.open({ id: PANE, title: 'Aikya Mods', columns: 44, rows: 20, closeOnEscape: true });
  state.visible = placement?.isPlaced !== false;
  state.hidden = false;
  sync($, state);
}
function status(flow) {
  const rows = phaseRows(flow);
  return ['AIKYA FLOW', 'Command: ' + (flow.command ? '/' + flow.command : 'Claude task'),
    'Native activity: ' + flow.status + ' · ' + flow.activity,
    'Source: ' + (flow.snapshot ? 'Aikya execution snapshot' : 'Native activity; phase evidence unavailable'),
    ...rows.map(row => `${SYMBOLS[row.status]} ${row.label}: ${LABELS[row.status]}${row.reason ? ' — ' + row.reason : ''}`)].join('\n');
}
export function register(on) {
  const state = { flow: createFlow(), visible: false, hidden: false, timer: null, cacheRoot: null, context: null, busy: false, sourceEpoch: 0 };
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'aikya-flow', description: 'Show command activity and evidence-backed workflow states', argumentHint: '[show|hide|status|connect <cache-root>|disconnect]', immediate: true });
    if (e.isInteractive && e.surface) await open($, state);
    return next(e);
  });
  on('command.run', { command: 'aikya-flow' }, async ($, e) => {
    const args = e.args.trim();
    if (args === 'hide') { state.hidden = true; state.visible = false; stop(state); await $.ui.close({ id: PANE }); return {}; }
    if (args === 'disconnect') { state.sourceEpoch += 1; state.cacheRoot = null; state.context = null; state.flow.snapshot = null; sync($, state); $.ui.invalidate('ui.render'); return {}; }
    if (args.startsWith('connect ')) {
      const path = args.slice(8).trim();
      try {
        const info = await $.fs.stat(path, { resolve: true });
        if (info.kind !== 'directory' || typeof info.realPath !== 'string') return { text: 'The execution cache must be an existing local directory.' };
        state.cacheRoot = info.realPath.replace(/\/$/, '');
        state.sourceEpoch += 1;
        state.context = null;
        await refresh($, state);
        sync($, state);
        return { text: state.flow.snapshot ? 'Connected to the current Aikya execution snapshot.' : 'Cache connected. No matching execution snapshot is available yet.' };
      } catch { return { text: 'Unable to read that execution cache directory.' }; }
    }
    if (args === 'status') { await refresh($, state); return { text: status(state.flow) }; }
    if (args && args !== 'show') return { text: 'Usage: /aikya-flow [show|hide|status|connect <cache-root>|disconnect]' };
    await refresh($, state);
    await open($, state);
    return {};
  });
  on('command.run', async ($, e, next) => {
    const command = normalizeCommand(e.command);
    if (!command) return next(e);
    beginRun(state.flow, command, await $.clock.now());
    $.ui.invalidate('ui.render');
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
    if (command) { observeSkill(state.flow, command, await $.clock.now()); $.ui.invalidate('ui.render'); }
    return next(e);
  });
  on('turn.start', async ($, e, next) => {
    if (!state.flow.pendingTurn) beginRun(state.flow, normalizeCommand(e.text.startsWith('/') ? e.text : ''), await $.clock.now());
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
    if (!e.agentId) await refresh($, state);
    $.ui.invalidate('ui.render');
    return next(e);
  });
  on('ui.close', { id: PANE }, async ($, e, next) => { state.visible = false; state.hidden = true; stop(state); return next(e); });
  on('session.end', async ($, e, next) => {
    stop(state); state.visible = false; state.hidden = false; state.sourceEpoch += 1; state.flow = createFlow(); state.context = null;
    return next(e);
  });
  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    if (e.requestId !== PANE) { state.visible = false; stop(state); return next(e); }
    if (!state.hidden && !state.visible) { state.visible = true; sync($, state); }
    const { Box, Text } = $.ui.resolve(e);
    const rows = phaseRows(state.flow);
    const content = [Text({ bold: true, children: ['AIKYA FLOW'] }),
      Text({ wrap: 'truncate-end', children: [state.flow.command ? '/' + state.flow.command : 'Claude task'] }),
      Text({ color: 'cyan', wrap: 'truncate-end', children: [state.flow.status + ' · ' + state.flow.activity] }),
      Text({ dimColor: true, children: [state.flow.snapshot ? 'Source: Aikya execution snapshot' : 'Native activity · No phase evidence'] }),
      ...rows.map(row => Text({ color: row.status === 'completed' ? 'green' : row.status === 'failed' ? 'red' : ['waiting','blocked'].includes(row.status) ? 'yellow' : row.status === 'running' ? 'cyan' : undefined,
        children: [`${SYMBOLS[row.status]} ${row.label}: ${LABELS[row.status]}`] })),
      ...rows.filter(row => row.reason).map(row => Text({ dimColor: true, children: [row.label + ': ' + row.reason] })),
    ];
    if (e.surface === 'terminal' && e.props.placement === 'inline') content.push(Text({ dimColor: true, children: ['Use a wider fullscreen terminal for side-by-side panes.'] }));
    const theirs = await next(e);
    return Box({ flexDirection: 'column', rowGap: 0, children: [...content, theirs] });
  });
}
