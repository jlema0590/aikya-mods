import { expect, test } from 'claude-code/testing'
import { sampleScene, asciiFrame } from '../lib/scene.js'

test('separated boxes travel from left to right at a steady speed', () => {
  expect(sampleScene(0)).toMatchObject({ boxes: [{ x: -60 }, { x: 160 }, { x: 380 }] })
  expect(sampleScene(8)).toMatchObject({ boxes: [{ x: 22.5 }, { x: 242.5 }, { x: 462.5 }] })
  expect(sampleScene(16)).toMatchObject({ boxes: [{ x: 105 }, { x: 325 }, { x: 545 }] })
})

test('the conveyor loops with boxes reentering outside the visible belt', () => {
  expect(sampleScene(63)).toMatchObject({ boxes: [{ x: 589.6875 }, { x: 149.6875 }, { x: 369.6875 }] })
  expect(sampleScene(64)).toMatchObject({ boxes: [{ x: -60 }, { x: 160 }, { x: 380 }] })
  expect(sampleScene(128)).toMatchObject({ boxes: [{ x: -60 }, { x: 160 }, { x: 380 }] })
})

test('terminal artwork shows boxes on a moving belt without the old robot', () => {
  const frame = asciiFrame(20, 44)
  expect(frame).not.toMatch('[o o]')
  expect(frame).toMatch('+--+')
  expect(frame).toMatch('===')
  expect(frame.split('\n').length).toBeLessThanOrEqual(8)
})
