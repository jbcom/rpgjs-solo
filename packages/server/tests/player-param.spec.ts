
import { testing } from '@rpgjs/testing'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { ATK, MAXHP, MAXHP_CURVE, MAXSP, MAXSP_CURVE, RpgPlayer } from '../src'

let player: RpgPlayer

beforeEach(async () => {
   const fixture = await testing();  
   const client = await fixture.createClient()
   player = client.player
   player.onGameStart()
})

test('Test HP', () => {
   expect(player.hp).toBe(MAXHP_CURVE.start)
})

test('Test SP', () => {
   expect(player.sp).toBe(MAXSP_CURVE.start)
})

test('Test MaxHP', () => {
   expect(player.param[MAXHP]).toBe(MAXHP_CURVE.start)
})

test('Test MaxSP', () => {
   expect(player.param[MAXSP]).toBe(MAXSP_CURVE.start)
})

test('Set fixed parameter value', () => {
   player.setParameter(MAXHP, 1000)
   player.setParameter(MAXSP, 250)

   expect(player.param[MAXHP]).toBe(1000)
   expect(player.param[MAXSP]).toBe(250)
})

test('Allow direct param assignment for fixed values', () => {
   player.param[MAXHP] = 900
   player.param[MAXSP] = 120

   expect(player.param[MAXHP]).toBe(900)
   expect(player.param[MAXSP]).toBe(120)
})
