import { beforeEach, test, expect } from 'vitest'
import { testing } from '@rpgjs/testing'
import { defineModule, createModule } from '@rpgjs/common'
import { RpgPlayer, RpgServer } from '../src'
import { RpgClient } from '../../client/src'

// Define your server module
const serverModule = defineModule<RpgServer>({
  player: {
    onConnected(player) {
      player.setVariable('test', 'value')
    }
  }
})

// Define your client module
const clientModule = defineModule<RpgClient>({
  // Client-side logic
})

let player: RpgPlayer

beforeEach(async () => {
    // Create module using createModule
    const myModule = createModule('MyModule', [{
        server: serverModule,
        client: clientModule
    }])
    
    // Pass the module created with createModule to testing
    const fixture = await testing(myModule)
    const client = await fixture.createClient()
    player = client.player
})

test('Module hook was called', () => {
  expect(player.getVariable('test')).toBe('value')
})