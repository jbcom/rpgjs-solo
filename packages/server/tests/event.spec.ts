import { beforeEach, test, expect, afterEach } from 'vitest'
import { testing, TestingFixture } from '@rpgjs/testing'
import { defineModule, createModule } from '@rpgjs/common'
import { RpgPlayer, RpgServer, Move } from '../src'
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
