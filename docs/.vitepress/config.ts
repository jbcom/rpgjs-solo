const apiMenu = [
    {
      text: 'Functions',
      collapsed: false,
      sidebarDepth: 2,
      items: [
        { text: "inject()", link: "/functions/inject" },
      ]
  
    },
    {
      text: 'Classes Server-Side',
      collapsed: false,
      sidebarDepth: 2,
      items: [
        { text: "Server Engine Class", link: "/classes/server-engine" },
        { text: "Server Class", link: "/classes/server" },
        { text: "Player Class", link: "/classes/player" },
        { text: "Scene Map Server Class", link: "/classes/scene-map-server" },
        { text: "Map Class", link: "/classes/map" },
        { text: "World Maps Class", link: "/classes/world-maps" },
        { text: "Event Class", link: "/classes/event" },
        { text: "Shape Class", link: "/classes/shape" },
        { text: "World Class", link: "/classes/world" }
      ]
  
    },
    {
      text: 'Classes Client-Side',
      collapsed: false,
      sidebarDepth: 2,
      items: [
        { text: "Client Class", link: "/classes/client" },
        { text: "Client Engine Class", link: "/classes/client-engine" },
        { text: "Sprite Class", link: "/classes/sprite" },
        { text: "Spritesheet Class", link: "/classes/spritesheet" },
        { text: "Scene Map Class", link: "/classes/scene-map" },
        { text: "GUI Class", link: "/classes/gui" },
        { text: "Sound Class", link: "/classes/sound" },
        { text: "Resource Class", link: "/classes/resource" },
        { text: "Keyboard Class", link: "/classes/keyboard" }
      ]
  
    },
    {
      text: 'VueJS',
      collapsed: false,
      sidebarDepth: 2,
      items: [
        { text: "Vue Inject Class", link: "/classes/vue-inject" },
        { text: "Vue directives", link: "/api-gui/vue-directive" }
      ]
    },
    {
      text: 'React',
      collapsed: false,
      sidebarDepth: 2,
      items: [
        { text: "React Hooks", link: "/api-gui/react" }
      ]
    },
    {
      text: 'Testing',
      collapsed: false,
      sidebarDepth: 2,
      items: [
        { text: "Testing Class", link: "/classes/tests" },
      ]
    },
    {
      text: 'Player Commands Server-Side',
      collapsed: false,
      sidebarDepth: 2,
      items: [
        { text: "Common Commands", link: "/commands/common" },
        { text: "Components", link: "/commands/components" },
        { text: "Parameter Commands", link: "/commands/parameter" },
        { text: "Class Commands", link: "/commands/class" },
        { text: "Gold Commands", link: "/commands/gold" },
        { text: "State Commands", link: "/commands/state" },
        { text: "Element Commands", link: "/commands/element" },
        { text: "Item Commands", link: "/commands/item" },
        { text: "Skill Commands", link: "/commands/skill" },
        { text: "Variable Commands", link: "/commands/variable" },
        { text: "Move Commands", link: "/commands/move" },
        { text: "GUI Commands", link: "/commands/gui" },
        { text: "Effect Commands", link: "/commands/effect" },
        { text: "Battle Commands", link: "/commands/battle" }
      ]
  
    },
    {
      text: 'RPG Database',
      collapsed: false,
      sidebarDepth: 2,
      items: [
        { text: "Item Database", link: "/database/item" },
        { text: "Weapon Database", link: "/database/weapon" },
        { text: "Armor Database", link: "/database/armor" },
        { text: "Actor Database", link: "/database/actor" },
        { text: "Class Database", link: "/database/class" },
        { text: "Skill Database", link: "/database/skill" },
        { text: "State Database", link: "/database/state" },
        { text: "Element Database", link: "/database/element" },
        { text: "Effect Database", link: "/database/effect" }
      ]
  
    },
    /*{
      text: 'Testing',
      collapsed: false,
      sidebarDepth: 2,
      items: [
        { text: "Unit Testing Class", link: "/classes/tests" }
      ]    
    }*/
  ]
  
  const migrationMenu = [{
    text: 'Migration',
    collapsed: false,
    items: [
      { text: "v3 to v4", link: "/migration/to-v4" }
    ]
  }]
  
  const web3Menu = [{
    text: 'Web3',
    collapsed: false,
    items: [
      { text: "Authentification with wallet", link: "/web3/auth" }
    ]
  }]
  
  const guideMenu = [{
    text: 'Quick Start',
    collapsed: false,
    items: [
     
    ]
  },
  {
    text: 'Go further',
    collapsed: false,
    items: [
     {
       
     }
    ]
  },
  {
    text: 'Hooks',
    collapsed: false,
    items: [
      { text: "Player Hooks", link: "/hooks/server-player-hooks" }
    ]
  },
  {
    text: 'GUI',
    collapsed: false,
    items: [
      { text: "Create a module", link: "/guide/create-module" },
      { text: "Create a movement", link: "/guide/create-movement" }
    ]
  },
  {
    text: 'Combat',
    collapsed: false,
    items: [
      { text: "Battle AI System", link: "/guide/battle-ai" }
    ]
  },

  ]
  
  const pluginMenu = [{
    text: 'Plugins',
    collapsed: false,
    items: [
      { text: "Adding Chat Functionality", link: "/plugins/chat" },
      { text: "Saving and Loading Game Data", link: "/plugins/save" },
      { text: "Creating a Title Screen Plugin", link: "/plugins/title-screen" },
      { text: "Displaying Emotion Bubbles for Characters", link: "/plugins/emotion-bubble" }
    ]
  }, 
  {
    text: 'Unofficial Plugins',
    collapsed: false,
    items: [
      { text: "Character Select", link: "/plugins/character-select" },
      { text: "Inventory GUI Plugin", link: "/plugins/inventory-plugin" },
    ]
  }]
  
  const GA_ID = 'G-VCPFWQS1BJ'
  
export default {
    //extends: baseConfig,
    title: 'RPGJS v4 Documentation',
    description: 'Create your RPG or MMORPG in Javascript',
    ignoreDeadLinks: true,
    themeConfig: {
      search: {
        provider: 'local'
      },
      repo: 'https://github.com/RSamaium/RPG-JS',
      nav: [{
        text: 'Home',
        link: 'https://rpgjs.dev'
      },
      {
        text: 'Guide',
        link: '/guide/get-started'
      },
      {
        text: 'API',
        link: '/commands/common'
      },
      {
        text: 'Plugins',
        link: '/plugins/chat'
      },
      {
        text: 'Lean more',
        items: [
          { text: 'Change Log', link: '/others/changelog' }
        ]
      },
      {
        text: 'Community',
        link: 'https://community.rpgjs.dev'
      }
      ],
      sidebar: {
        '/functions/': apiMenu,
        '/hooks/': guideMenu,
        '/classes/': apiMenu,
        '/commands/': apiMenu,
        '/database/': apiMenu,
        '/api/': apiMenu,
        '/api-gui/': apiMenu,
        '/guide/': guideMenu,
        '/gui/': guideMenu,
        '/advanced/': guideMenu,
        '/plugins/': pluginMenu,
        '/migration/': guideMenu,
        '/web3/': guideMenu,
      },
    }
  }