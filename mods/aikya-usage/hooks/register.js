import { normalizeUsage, createLedger, recordStep, recordTurn, readLedger, footerParts, details, turnKey } from '../lib/usage.js';

async function refresh($, state) {
  const epoch = state.epoch;
  try { const raw = await $.session.usage(); if (epoch === state.epoch) state.raw = raw; }
  catch { if (epoch === state.epoch) state.raw = {}; }
  $.ui.invalidate('ui.render');
}

export function register(on) {
  const state = { raw: {}, ledger: createLedger(), epoch: 0, closed: false, turns: new Set(), visible: true };
  on('session.start', async ($, e, next) => {
    await refresh($, state);
    await $.command.register({ name: 'aikya-usage', description: 'Show context, observed token totals and account usage', argumentHint: '[show|hide]', immediate: true });
    return next(e);
  });
  on('command.run', { command: 'aikya-usage' }, async ($, e) => {
    const action = e.args.trim();
    if (action === 'hide' || action === 'show') {
      state.visible = action === 'show';
      $.ui.invalidate('ui.render');
      return {};
    }
    if (action) return { text: 'Usage: /aikya-usage [show|hide]' };
    await refresh($, state);
    return { text: details(normalizeUsage(state.raw, await $.clock.now()), readLedger(state.ledger)) };
  });
  on('session.measure', async ($, e, next) => {
    state.raw = e;
    $.ui.invalidate('ui.render');
    return next(e);
  });
  on('turn.start', async ($, e, next) => {
    state.closed = false;
    state.turns.add(turnKey(e));
    return next(e);
  });
  on('turn.step', async function* ($, e, next) {
    const epoch = state.epoch;
    state.turns.add(turnKey(e));
    const result = yield* next(e);
    if (epoch === state.epoch && !state.closed) {
      recordStep(state.ledger, e, result.usage);
      $.ui.invalidate('ui.render');
    }
    return result;
  });
  on('turn.complete', async ($, e, next) => {
    if (!state.closed && state.turns.has(turnKey(e))) {
      recordTurn(state.ledger, e);
      state.turns.delete(turnKey(e));
      $.ui.invalidate('ui.render');
    }
    return next(e);
  });
  on('session.end', async ($, e, next) => {
    state.raw = {};
    state.ledger = createLedger();
    state.turns.clear();
    state.epoch += 1;
    state.closed = true;
    $.ui.invalidate('ui.render');
    return next(e);
  });
  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    if (!state.visible || (e.surface !== 'terminal' && e.surface !== 'desktop')) return next(e);
    const { Text } = $.ui.resolve(e);
    // PromptHint shares its row with Claude's mode indicators and separators.
    const columns = Math.max(24, (e.viewport?.columns || 80) - 24);
    const parts = footerParts(normalizeUsage(state.raw, await $.clock.now()), readLedger(state.ledger), columns);
    return Text({ wrap: 'truncate-end', children: parts.map(segment => Text({
      color: segment.tone, dimColor: segment.tone === 'text' || segment.tone === 'inactive', children: [segment.text],
    })) });
  });
}
