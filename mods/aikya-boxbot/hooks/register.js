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
  const state = { frame: 0, visible: false, paused: false, still: false, timer: null };

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
      state.visible = false;
      stop(state);
      await $.ui.close({ id: PANE });
      return {};
    }
    if (!['show', 'pause', 'resume', 'still', 'motion'].includes(action)) {
      return { text: 'Usage: /aikya-boxbot [show|pause|resume|still|motion|hide]' };
    }
    if (action === 'pause') state.paused = true;
    if (action === 'resume') state.paused = false;
    if (action === 'still') { state.still = true; state.frame = 20; }
    if (action === 'motion') state.still = false;
    const placement = await $.ui.open({ id: PANE, title: 'Aikya BoxBot', focus: true, closeOnEscape: true });
    state.visible = placement.isPlaced;
    sync($, state);
    return {};
  });

  on('ui.close', { id: PANE }, async ($, e, next) => {
    state.visible = false;
    stop(state);
    return next(e);
  });

  on('session.end', async ($, e, next) => {
    state.visible = false;
    stop(state);
    return next(e);
  });

  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    if (e.requestId !== PANE) return next(e);
    const { Box, Text, Code, Svg } = $.ui.resolve(e);
    const status = state.still ? 'Still mode' : state.paused ? 'Paused' : sampleScene(state.frame).phase;
    const columns = e.props.bodyColumns || Math.max(12, (e.viewport?.columns || 48) - 4);
    const artwork = e.surface === 'desktop' || e.surface === 'vscode'
      ? Svg({ source: svgFrame(state.frame), alt: 'Boxes moving from left to right on a conveyor belt' })
      : Code({ source: asciiFrame(state.frame, columns) });
    return Box({ flexDirection: 'column', children: [
      Text({ key: 'title', bold: true, children: ['AIKYA BOXBOT'] }),
      Text({ key: 'activity', children: [status] }),
      artwork,
      Text({ dimColor: true, children: ['Decorative animation. No task progress is measured.'] }),
    ] });
  });
}
