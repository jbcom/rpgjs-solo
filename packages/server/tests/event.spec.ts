import { beforeEach, test, expect, afterEach } from 'vitest'
import { testing, TestingFixture } from '@rpgjs/testing'
import { defineModule, createModule } from '@rpgjs/common'
import { EventData, RpgEvent, RpgPlayer, RpgServer, Move } from '../src'
import { RpgClient } from '../../client/src'

const Event = () => {
  return {
    name: "EV-1",
    onInit() {
      this.setGraphic("hero");
    }
  }
}

// Define server module with two maps
const serverModule = defineModule<RpgServer>({
  maps: [
    {
      id: 'map1',
      events: [{ event: Event(), x: 100, y: 150 }]
    },
  ],
  player: {
    async onConnected(player) {
      await player.changeMap('map1', { x: 100, y: 126 })
    }
  }
})

// Define client module
const clientModule = defineModule<RpgClient>({
  // Client-side logic
})

let player: RpgPlayer
let client: any
let fixture: TestingFixture

beforeEach(async () => {
    const myModule = createModule('TestModule', [{
        server: serverModule,
        client: clientModule
    }])
    
    fixture = await testing(myModule)
    client = await fixture.createClient()
    player = client.player
})

afterEach(() => {
  fixture.clear()
})

test.skip('Player to touch event', async () => {
    player = await client.waitForMapChange('map1')
    const map = player.getCurrentMap()
    const event = map?.getEvents()[0]
    expect(event).toBeDefined()
    expect(event?.name).toBe("EV-1")
    expect(event?.x()).toBe(100)
    expect(event?.y()).toBe(150)
    await fixture.waitUntil(
        player.moveRoutes([
          Move.tileDown(2),
        ], {
          onStuck: () => false
        })
    )
    expect(event?.x()).toBe(100)
    expect(event?.y()).toBe(150)
    await fixture.waitUntil(
      event!.moveRoutes([
        Move.down()
      ])
    )
    expect(event?.x()).toBe(100)
    expect(event?.y()).toBe(150 + event!.speed)
   
})

test('event without pushable stays immovable while keeping its configured mass', async () => {
    player = await client.waitForMapChange('map1')
    const map = player.getCurrentMap() as any
    const event = map?.getEvents()[0]
    const body = map?.getBody(event.id)
    const playerBody = map?.getBody(player.id)

    expect(event.pushable).toBe(false)
    expect(event.mass).toBe(100)
    expect(body?.mass).toBe(100)
    expect(body?.invMass).toBe(1 / 100)
    expect(body?.canBePushedBy(playerBody)).toBe(false)
})

test('object-based EventDefinition applies mass to the physics body when pushable', async () => {
    player = await client.waitForMapChange('map1')
    const map = player.getCurrentMap() as any

    await map.createDynamicEvent({
      id: "crate-object",
      x: 160,
      y: 160,
      event: {
        name: "Crate",
        pushable: true,
        mass: 20,
        onInit() {
          expect(this.mass).toBe(20)
          expect(this.pushable).toBe(true)
        }
      }
    })
    await fixture.nextTick()

    const event = map.getEvent("crate-object")
    const body = map.getBody("crate-object")

    expect(event.mass).toBe(20)
    expect(event.pushable).toBe(true)
    expect(body.mass).toBe(20)
    expect(body.invMass).toBe(1 / 20)
})

test('object-based EventDefinition mass does not make an event pushable by itself', async () => {
    player = await client.waitForMapChange('map1')
    const map = player.getCurrentMap() as any

    await map.createDynamicEvent({
      id: "heavy-static-object",
      x: 175,
      y: 160,
      event: {
        name: "HeavyStatic",
        mass: 20,
      }
    })
    await fixture.nextTick()

    const event = map.getEvent("heavy-static-object")
    const body = map.getBody("heavy-static-object")
    const playerBody = map.getBody(player.id)

    expect(event.mass).toBe(20)
    expect(event.pushable).toBe(false)
    expect(body.mass).toBe(20)
    expect(body.invMass).toBe(1 / 20)
    expect(body.canBePushedBy(playerBody)).toBe(false)
})

test('non-pushable events can still move through scripted routes', async () => {
    player = await client.waitForMapChange('map1')
    const map = player.getCurrentMap() as any

    await map.createDynamicEvent({
      id: "scripted-npc",
      x: 300,
      y: 160,
      event: {
        name: "ScriptedNpc",
      }
    })
    await fixture.nextTick()

    const event = map.getEvent("scripted-npc")
    const startY = event.y()

    await fixture.waitUntil(
      event.moveRoutes([
        Move.down()
      ])
    )

    expect(event.pushable).toBe(false)
    expect(event.y()).toBe(startY + event.speed)
})

test('EventData mass applies to class-based events when pushable', async () => {
    player = await client.waitForMapChange('map1')
    const map = player.getCurrentMap() as any

    class HeavyEvent extends RpgEvent {}
    EventData({
      name: "Heavy",
      pushable: true,
      mass: 250,
    })(HeavyEvent)

    await map.createDynamicEvent({
      id: "heavy-class",
      x: 190,
      y: 160,
      event: HeavyEvent,
    })
    await fixture.nextTick()

    const event = map.getEvent("heavy-class")
    const body = map.getBody("heavy-class")

    expect(event.mass).toBe(250)
    expect(event.pushable).toBe(true)
    expect(body.mass).toBe(250)
    expect(body.invMass).toBe(1 / 250)
})

test('setMass updates an existing pushable event physics body', async () => {
    player = await client.waitForMapChange('map1')
    const map = player.getCurrentMap() as any

    await map.createDynamicEvent({
      id: "runtime-mass",
      x: 220,
      y: 160,
      event: {
        name: "RuntimeMass",
        pushable: true,
      }
    })
    await fixture.nextTick()

    const event = map.getEvent("runtime-mass")
    const body = map.getBody("runtime-mass")

    event.setMass(5)

    expect(event.mass).toBe(5)
    expect(body.mass).toBe(5)
    expect(body.invMass).toBe(1 / 5)
})

test('setMass does not make a non-pushable event movable', async () => {
    player = await client.waitForMapChange('map1')
    const map = player.getCurrentMap() as any

    await map.createDynamicEvent({
      id: "runtime-static-mass",
      x: 240,
      y: 160,
      event: {
        name: "RuntimeStaticMass",
      }
    })
    await fixture.nextTick()

    const event = map.getEvent("runtime-static-mass")
    const body = map.getBody("runtime-static-mass")

    event.setMass(5)

    expect(event.mass).toBe(5)
    expect(event.pushable).toBe(false)
    expect(body.mass).toBe(5)
    expect(body.invMass).toBe(1 / 5)
    expect(body.canBePushedBy(map.getBody(player.id))).toBe(false)
})

test('changing pushable at runtime updates the event physics body', async () => {
    player = await client.waitForMapChange('map1')
    const map = player.getCurrentMap() as any

    await map.createDynamicEvent({
      id: "runtime-pushable",
      x: 260,
      y: 160,
      event: {
        name: "RuntimePushable",
        mass: 12,
      }
    })
    await fixture.nextTick()

    const event = map.getEvent("runtime-pushable")
    const body = map.getBody("runtime-pushable")

    expect(body.mass).toBe(12)
    expect(body.canBePushedBy(map.getBody(player.id))).toBe(false)

    event.pushable = true
    await fixture.nextTick()

    expect(event.pushable).toBe(true)
    expect(body.mass).toBe(12)
    expect(body.invMass).toBe(1 / 12)
    expect(body.canBePushedBy(map.getBody(player.id))).toBe(true)
})
