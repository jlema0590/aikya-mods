import { expect, test } from 'claude-code/testing'
import * as motion from '../lib/motion.js'

const snapshot = phases => ({ runId: 'r', generation: 1, phases: phases.map(([id,status]) => ({ id,status })) })
test('only a running phase or native header rotates and still keeps a static symbol', () => {
  expect(typeof motion.motionFrame).toBe('function')
  for (const [frame,symbol] of [[0,'◐'],[1,'◓'],[2,'◑'],[3,'◒'],[4,'◐']]) {
    expect(motion.motionFrame({ phaseStatus: 'running', frame }).symbol).toBe(symbol)
  }
  expect(motion.motionFrame({ phaseStatus: 'unknown', nativeRunning: true, frame: 1 })).toMatchObject({ symbol: '?', animate: false })
  expect(motion.motionFrame({ phaseStatus: 'waiting', frame: 1 }).animate).toBe(false)
  expect(motion.motionFrame({ phaseStatus: 'running', still: true, frame: 2 })).toMatchObject({ symbol: '●', animate: false })
  expect(motion.motionFrame({ nativeRunning: true, frame: 2 }).animate).toBe(true)
})
test('emphasis lasts 250ms only for a real same-candidate transition', () => {
  expect(typeof motion.transitionEmphasis).toBe('function')
  const previous = snapshot([['explore','running'],['plan','pending']])
  const current = snapshot([['explore','completed'],['plan','running']])
  expect(motion.transitionEmphasis(previous,current,1000,1000)).toEqual({ phaseIds: ['explore'], connectorIds: ['explore'] })
  expect(motion.transitionEmphasis(previous,current,1000,1249).phaseIds).toEqual(['explore'])
  expect(motion.transitionEmphasis(previous,current,1000,1250)).toEqual({ phaseIds: [], connectorIds: [] })
  for (const old of [null,current,{...previous,runId:'old'},{...previous,generation:0}]) {
    expect(motion.transitionEmphasis(old,current,1000,1000).phaseIds).toEqual([])
  }
  expect(motion.transitionEmphasis(previous,snapshot([['explore','failed'],['plan','pending']]),1000,1000).phaseIds).toEqual(['explore'])
})
