import { FRAME_MS, FRAME_COUNT, sampleScene, asciiFrame, svgFrame } from '../lib/scene.js';

const PANE = 'aikya-boxbot';

function stop(state) {
  if (state.timer) state.timer.cancel();
  state.timer = null;
}

function sync($, state) {
  stop(state);
  if (state.visible && !state.paused && !state.still) {
    state.timer = $.clock.every(FRAME_MS, () => {
      state.frame = (state.frame + 1) % FRAME_COUNT;
      $.ui.invalidate('ui.render');
    });
  }
  $.ui.invalidate('ui.render');
}

export function register(on) {
  const state = { frame: 0, visible: false, paused: false, still: false, timer: null, shared: false, hidden: false };

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'aikya-boxbot',
      description: 'Show boxes moving along a conveyor belt',
      argumentHint: '[show|pause|resume|still|motion|hide]',
      immediate: true,
    });
    return next(e);
  });

  on('command.run', { command: 'aikya-boxbot' }, async ($, e) => {
    const action = e.args.trim() || 'show';
    if (action === 'hide') {
      state.hidden = true;
      state.visible = false;
      stop(state);
      await $.ui.close({ id: PANE });
      $.ui.invalidate('ui.render');
      return {};
    }
    if (!['show', 'pause', 'resume', 'still', 'motion'].includes(action)) {
      return { text: 'Usage: /aikya-boxbot [show|pause|resume|still|motion|hide]' };
    }
    if (action === 'pause') state.paused = true;
    if (action === 'resume') state.paused = false;
    if (action === 'still') { state.still = true; state.frame = 20; }
    if (action === 'motion') state.still = false;
    state.hidden = false;
    if (state.shared) { state.visible = true; sync($, state); return {}; }
    const placement = await $.ui.open({ id: PANE, title: 'Aikya BoxBot', focus: true, closeOnEscape: true });
    state.visible = placement.isPlaced;
    sync($, state);
    return {};
  });

  on('ui.close', { id: PANE }, async ($, e, next) => {
    if (!state.shared) { state.visible = false; stop(state); }
    return next(e);
  });

  on('ui.close', { id: 'aikya-flow' }, async ($, e, next) => {
    if (state.shared) { state.visible = false; state.shared = false; stop(state); }
    return next(e);
  });

  on('session.end', async ($, e, next) => {
    state.visible = false;
    stop(state);
    return next(e);
  });

  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    const shared = e.requestId === 'aikya-flow';
    if (e.requestId !== PANE && !shared) {
      state.visible = false; state.shared = false; stop(state);
      return next(e);
    }
    const theirs = shared ? await next(e) : null;
    if (shared && state.hidden) return theirs;
    if (shared && (!state.shared || !state.visible)) {
      state.shared = true; state.visible = true; sync($, state);
    }
    if (!shared) state.shared = false;
    const { Box, Text, Code, Svg } = $.ui.resolve(e);
    const status = state.still ? 'Still mode' : state.paused ? 'Paused' : sampleScene(state.frame).phase;
    const columns = e.props.bodyColumns || Math.max(12, (e.viewport?.columns || 48) - 4);
    const artwork = e.surface === 'desktop' || e.surface === 'vscode'
      ? Svg({ source: svgFrame(state.frame), alt: 'Boxes moving from left to right on a conveyor belt' })
      : Code({ source: asciiFrame(state.frame, columns) });
    const content = Box({ flexDirection: 'column', flexShrink: 0, children: [
      Text({ key: 'title', bold: true, children: ['AIKYA BOXBOT'] }),
      Text({ key: 'activity', children: [status] }),
      artwork,
      Text({ dimColor: true, children: ['Decorative animation. No task progress is measured.'] }),
    ] });
    if (shared) {
      // Flow owns the full-height frame. Fill its footer when it rendered first;
      // otherwise return compact content for Flow to place there after next().
      if (theirs?.props?.key === 'aikya-mods-pane' && theirs.children?.some(child => child?.props?.key === 'aikya-mods-footer')) {
        return { ...theirs, children: theirs.children.map(child => child?.props?.key === 'aikya-mods-footer'
          ? { ...child, children: [...(child.children || []), content] } : child) };
      }
      if (theirs?.type === 'engine') return content;
      return Box({ flexDirection: 'column', children: [theirs, content] });
    }
    const rows = e.props.scroll?.bodyRows;
    const minHeight = e.props.placement === 'dock' && Number.isFinite(rows) && rows > 0 ? rows : undefined;
    return Box({ key: 'aikya-boxbot-pane', flexDirection: 'column', minHeight,
      justifyContent: 'flex-end', children: [content] });
  });
}
