import { mergeConfig, Provider } from "@signe/di";
import { provideRpg, startGame, provideClientModules, provideLoadMap, provideClientGlobalConfig, inject, WebSocketToken, AbstractWebsocket, RpgClientEngine, RpgClient, LoadMapToken } from "@rpgjs/client";
import { createServer, provideServerModules, RpgServer, RpgPlayer } from "@rpgjs/server";
import { h, Container } from "canvasengine";

/**
 * Provides a default map loader for testing environments
 * 
 * This function returns a `provideLoadMap` provider that creates mock maps
 * with default dimensions (1024x768) and a minimal component. It's automatically
 * used by `testing()` if no custom `provideLoadMap` is provided in `clientConfig.providers`.
 * 
 * @returns A provider function that can be used with `provideLoadMap`
 * @example
 * ```ts
 * // Used automatically by testing()
 * const fixture = await testing([myModule])
 * 
 * // Or use directly in clientConfig
 * const fixture = await testing([myModule], {
 *   providers: [provideTestingLoadMap()]
 * })
 * ```
 */
export function provideTestingLoadMap() {
    return provideLoadMap((id: string) => {
        return {
            id,
            data: {
                width: 1024,
                height: 768,
                hitboxes: []
            },
            component: h(Container),
            width: 1024,
            height: 768,
        }
    })
}

/**
 * Normalizes modules input to extract server/client modules from createModule providers or direct module objects
 * 
 * @param modules - Array of modules that can be either:
 *   - Direct module objects: { server: RpgServer, client: RpgClient }
 *   - Providers returned by createModule(): Provider[] with meta.server/client and useValue
 * @returns Object with separate arrays for server and client modules
 * @example
 * ```ts
 * // Direct modules
 * normalizeModules([{ server: serverModule, client: clientModule }])
 * 
 * // createModule providers
 * const providers = createModule('MyModule', [{ server: serverModule, client: clientModule }])
 * normalizeModules(providers)
 * ```
 */
function normalizeModules(modules: any[]): { serverModules: RpgServer[], clientModules: RpgClient[] } {
    if (!modules || modules.length === 0) {
        return { serverModules: [], clientModules: [] }
    }

    // Check if first item is a provider (has meta and useValue properties)
    const isProviderArray = modules.some((item: any) => 
        item && typeof item === 'object' && 'meta' in item && 'useValue' in item
    )

    const serverModules: RpgServer[] = []
    const clientModules: RpgClient[] = []

    if (!isProviderArray) {
        // Direct module objects, extract server and client separately
        modules.forEach((module: any) => {
            if (module && typeof module === 'object') {
                if (module.server) {
                    serverModules.push(module.server)
                }
                if (module.client) {
                    clientModules.push(module.client)
                }
            }
        })
        return { serverModules, clientModules }
    }

    // Extract modules from createModule providers
    // createModule returns providers where useValue contains the original { server, client } object
    // We need to group providers by their useValue to reconstruct the original modules
    const seenUseValues = new Set<any>()

    modules.forEach((provider: any) => {
        if (!provider || typeof provider !== 'object' || !('meta' in provider) || !('useValue' in provider)) {
            return
        }

        const { useValue } = provider
        
        // Skip if we've already processed this useValue (same module, different provider for server/client)
        if (seenUseValues.has(useValue)) {
            return
        }

        // Check if useValue has server or client properties (it's a module object)
        if (useValue && typeof useValue === 'object' && ('server' in useValue || 'client' in useValue)) {
            seenUseValues.add(useValue)
            if (useValue.server) {
                serverModules.push(useValue.server)
            }
            if (useValue.client) {
                clientModules.push(useValue.client)
            }
        }
    })

    return { serverModules, clientModules }
}

/**
 * Testing utility function to set up server and client instances for unit testing
 * 
 * This function creates a test environment with both server and client instances,
 * allowing you to test player interactions, server hooks, and game mechanics.
 * 
 * @param modules - Array of modules that can be either:
 *   - Direct module objects: { server: RpgServer, client: RpgClient }
 *   - Providers returned by createModule(): Provider[] with meta.server/client and useValue
 * @param clientConfig - Optional client configuration
 * @param serverConfig - Optional server configuration
 * @returns Testing fixture with createClient method
 * @example
 * ```ts
 * // Using direct modules
 * const fixture = await testing([{
 *   server: serverModule,
 *   client: clientModule
 * }])
 * 
 * // Using createModule
 * const myModule = createModule('MyModule', [{
 *   server: serverModule,
 *   client: clientModule
 * }])
 * const fixture = await testing(myModule)
 * ```
 */
export async function testing(
    modules: ({ server?: RpgServer, client?: RpgClient } | Provider)[] = [], 
    clientConfig: any = {}, 
    serverConfig: any = {}
) {
    // Normalize modules to extract server/client from providers if needed
    const { serverModules, clientModules } = normalizeModules(modules as any[])
    
    const serverClass = createServer({
        ...serverConfig,
        providers: [
            provideServerModules(serverModules),
            ...(serverConfig.providers || [])
        ]
    })
    return {
        async createClient() {
            // Check if LoadMapToken is already provided in clientConfig.providers
            // (provideLoadMap returns an array with LoadMapToken)
            const hasLoadMap = clientConfig.providers?.some((provider: any) => {
                if (Array.isArray(provider)) {
                    return provider.some((p: any) => p?.provide === LoadMapToken)
                }
                return provider?.provide === LoadMapToken
            }) || false
            
            const client = await startGame(
                mergeConfig({
                    ...clientConfig,
                    providers: [
                        provideClientGlobalConfig({}),
                        ...(hasLoadMap ? [] : [provideTestingLoadMap()]), // Add only if not already provided
                        provideClientModules(clientModules),
                        ...(clientConfig.providers || [])
                    ]
                }, {
                    providers: [provideRpg(serverClass)],
                })
            )
            const websocket = inject<AbstractWebsocket>(WebSocketToken) as any
            const clientEngine = inject<RpgClientEngine>(RpgClientEngine)
            const playerId = clientEngine.playerId
            if (!playerId) {
                throw new Error('Player ID is not available')
            }
            const playerIdString: string = playerId
            return {
                get server() {
                    return  websocket.getServer()
                },
                socket: websocket.getSocket(),
                client: clientEngine,
                playerId: playerIdString,
                get player(): RpgPlayer {
                    return this.server.subRoom.players()[playerIdString] as RpgPlayer
                },
                /**
                 * Wait for player to be on a specific map
                 * 
                 * This utility function polls the player's current map until it matches
                 * the expected map ID, or throws an error if the timeout is exceeded.
                 * 
                 * @param expectedMapId - The expected map ID (without 'map-' prefix, e.g. 'map1')
                 * @param timeout - Maximum time to wait in milliseconds (default: 5000)
                 * @returns Promise that resolves when player is on the expected map
                 * @throws Error if timeout is exceeded
                 * @example
                 * ```ts
                 * const client = await fixture.createClient()
                 * await client.waitForMapChange('map1')
                 * ```
                 */
                async waitForMapChange(expectedMapId: string, timeout = 5000): Promise<RpgPlayer> {
                    const startTime = Date.now()

                    while (Date.now() - startTime < timeout) {
                        const currentMap = this.player.getCurrentMap()
                        if (currentMap?.id === expectedMapId) {
                            return this.player
                        }
                        await new Promise(resolve => setTimeout(resolve, 50)) // Wait 50ms before next check
                    }
                    
                    const currentMap = this.player.getCurrentMap()
                    throw new Error(
                        `Timeout: Player did not reach map ${expectedMapId} within ${timeout}ms. ` +
                        `Current map: ${currentMap?.id || 'null'}`
                    )
                }
            }
        }
    }
}