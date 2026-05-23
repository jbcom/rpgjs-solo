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

test('event without explicit mass keeps the default event mass', async () => {
    player = await client.waitForMapChange('map1')
    const map = player.getCurrentMap() as any
    const event = map?.getEvents()[0]
    const body = map?.getBody(event.id)

    expect(body?.mass).toBe(100)
    expect(event.mass).toBe(100)
})

test('object-based EventDefinition applies mass to the physics body', async () => {
    player = await client.waitForMapChange('map1')
    const map = player.getCurrentMap() as any

    await map.createDynamicEvent({
      id: "crate-object",
      x: 160,
      y: 160,
      event: {
        name: "Crate",
        mass: 20,
        onInit() {
          expect(this.mass).toBe(20)
        }
      }
    })
    await fixture.nextTick()

    const event = map.getEvent("crate-object")
    const body = map.getBody("crate-object")

    expect(event.mass).toBe(20)
    expect(body.mass).toBe(20)
    expect(body.invMass).toBe(1 / 20)
})

test('EventData mass applies to class-based events', async () => {
    player = await client.waitForMapChange('map1')
    const map = player.getCurrentMap() as any

    class HeavyEvent extends RpgEvent {}
    EventData({
      name: "Heavy",
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
    expect(body.mass).toBe(250)
    expect(body.invMass).toBe(1 / 250)
})

test('setMass updates an existing event physics body', async () => {
    player = await client.waitForMapChange('map1')
    const map = player.getCurrentMap() as any

    await map.createDynamicEvent({
      id: "runtime-mass",
      x: 220,
      y: 160,
      event: {
        name: "RuntimeMass",
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
