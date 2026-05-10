import { beforeEach, test, expect, afterEach } from 'vitest'
import { testing } from '@rpgjs/testing'
import { defineModule, createModule } from '@rpgjs/common'
import { RpgPlayer, RpgServer } from '../src'
import { RpgClient } from '../../client/src'

// Define server module with two maps
const serverModule = defineModule<RpgServer>({
  maps: [
    {
      id: 'map1',
      file: '',
    },
    {
      id: 'map2',
      file: '',
    }
  ],
  map: {
    onBeforeUpdate(mapData) {
      if (mapData.id === 'map2') {
        mapData.positions = {
          start: { x: 300, y: 310 },
          entrance: { x: 400, y: 410 },
        }
      }
      return mapData
    }
  },
  player: {
    async onConnected(player) {
      // Start player on map1
      await player.changeMap('map1', { x: 100, y: 100 })
    },
    onJoinMap(player) {
      console.log('onJoinMap', player.getCurrentMap()?.id)
    }
  }
})

// Define client module
const clientModule = defineModule<RpgClient>({
  // Client-side logic
})

let player: RpgPlayer
let client: any
let fixture: any

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

test('Player can change map', async () => {
    player = await client.waitForMapChange('map1')
    
    const initialMap = player.getCurrentMap()
    expect(initialMap).toBeDefined()
    expect(initialMap?.id).toBe('map1')
    
    const result = await player.changeMap('map2', { x: 200, y: 200 })
    expect(result).toBe(true)
    
    player = await client.waitForMapChange('map2')
    
    const newMap = player.getCurrentMap()
    expect(newMap).toBeDefined()
    expect(newMap?.id).toBe('map2')
    
    expect(player.x()).toBe(200)
    expect(player.y()).toBe(200)

    await player.changeMap('map1', { x: 100, y: 100 })
    player = await client.waitForMapChange('map1')

    const implicitResult = await player.changeMap('map2')
    expect(implicitResult).toBe(true)

    player = await client.waitForMapChange('map2')
    await fixture.wait(0)

    expect(player.x()).toBe(300)
    expect(player.y()).toBe(310)

    await player.changeMap('map1', { x: 100, y: 100 })
    player = await client.waitForMapChange('map1')

    const namedResult = await player.changeMap('map2', 'entrance')
    expect(namedResult).toBe(true)

    player = await client.waitForMapChange('map2')
    await fixture.wait(0)

    expect(player.x()).toBe(400)
    expect(player.y()).toBe(410)
})
