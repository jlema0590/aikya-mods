import { expect, test } from 'claude-code/testing'
import * as view from '../lib/view.js'
import { createFlow, phaseRows, recipe } from '../lib/flow.js'

test('cards keep all six phases, five connectors and all state labels and colors', () => {
  expect(typeof view.phaseView).toBe('function')
  const rows = phaseRows(createFlow())
  const drawing = view.phaseView(rows, { bodyColumns: 38, bodyRows: 46, placement: 'dock' })
  expect(drawing.mode).toBe('cards')
  expect(drawing.width).toBe(38)
  expect(drawing.nodes.map(row => row.id)).toEqual(['explore','plan','implement','validate','security','review'])
  expect(drawing.nodes.every(row => row.stateLabel === 'No evidence')).toBe(true)
  for (const [status,label,color] of [['unknown','No evidence','inactive'],['pending','Pending','inactive'],['running','Running','cyan'],['waiting','Waiting','warning'],['completed','Completed','success'],['failed','Failed','error'],['skipped','Not applicable','inactive'],['blocked','Blocked','warning'],['interrupted','Interrupted','warning']]) {
    const node = view.phaseView([{ ...rows[0], status }], { bodyColumns: 38, bodyRows: 46, placement: 'dock' }).nodes[0]
    expect(node.stateLabel).toBe(label)
    expect(node.color).toBe(color)
  }
})

test('layout reserves footer space and falls back to compact at size boundaries', () => {
  expect(typeof view.phaseView).toBe('function')
  const rows = phaseRows(createFlow())
  for (const [bodyColumns,bodyRows,placement,mode] of [[32,45,'dock','cards'],[31,45,'dock','compact'],[32,44,'dock','compact'],[38,46,'inline','compact'],[undefined,undefined,'dock','compact']]) {
    expect(view.phaseView(rows, { bodyColumns, bodyRows, placement }).mode).toBe(mode)
  }
  expect(view.phaseView(recipe('aikya-bugfix'), { bodyColumns: 38, bodyRows: 46, placement: 'dock' }).nodes.slice(0,4).map(row => row.label)).toEqual(['Reproduce','Diagnose','Fix','Regression'])
  expect(view.phaseView(recipe('aikya-verify'), {}).nodes[2].stateLabel).toBe('Not applicable')
})
