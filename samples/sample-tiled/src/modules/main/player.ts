import { RpgPlayer, type RpgPlayerHooks, Components } from '@rpgjs/server'

export const player: RpgPlayerHooks = {
    props: {
        wood: Number
    },
    onConnected(player: RpgPlayer) {
        player.changeMap('simplemap')
        player.name.set('YourName')
        player.setGraphic('hero')
        player.initializeDefaultStats()
        player.setComponentsBottom(
            Components.shape({
                type: 'rect',
                width: 32,
                height: 32,
                fill: '#ff0000',
                opacity: 0.5
            }), 
            {
                marginBottom: 16
            }
        )
       
    },
    onInput(player: RpgPlayer, { action }) {
        if (action == 'escape') {
            player.callMainMenu()
        }
    },
    async onJoinMap(player: RpgPlayer) {
        if (player.getVariable('AFTER_INTRO')) {
            return
        }
        // await player.showText('Welcome to the start of RPGJS. Short presentation of the structure:')
        // await player.showText('1. Open the map src/modules/main/server/maps/tmx/samplemap.tmx with Tiled Map Editor !')
        // await player.showText('2. All the modules are in src/modules/index.ts, it is a suite of systems to make a complete set. Remove modules or add some!')
        // await player.showText('3. The global configuration is done in src/config')
        // await player.showText('And, please, support the project on github https://github.com/RSamaium/RPG-JS ! :)')
        player.setVariable('AFTER_INTRO', true)
    }
}