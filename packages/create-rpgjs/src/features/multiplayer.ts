import path from 'node:path'
import { writeFile } from 'node:fs/promises'
import { replaceInFile } from '../utils/fs.js'

export async function applyMultiplayerFeature(projectDir, { typescript = false } = {}) {
  const ext = typescript ? 'ts' : 'js'
  const mainFile = path.join(projectDir, 'src', `main.${ext}`)

  await replaceInFile(mainFile, () => {
    return `import { mergeConfig } from '@signe/di'\nimport { provideMmorpg, startGame } from '@rpgjs/client'\nimport configClient from './config/client'\n\nstartGame(\n  mergeConfig(configClient, {\n    providers: [provideMmorpg({ connectionIdScope: 'ephemeral' })]\n  })\n)\n`
  })

  await writeFile(
    path.join(projectDir, 'src', `config/server.${ext}`),
    `import { createServer } from '@rpgjs/server'\n\nexport default createServer({\n  providers: []\n})\n`,
    'utf8'
  )

  await replaceInFile(path.join(projectDir, `vite.config.${ext}`), (content) =>
    content
      .replace("import { defineConfig } from 'vite'", "import { defineConfig } from 'vite'\nimport { rpgjs } from '@rpgjs/vite'\nimport startServer from './src/config/server'")
      .replace('plugins: []', 'plugins: [...rpgjs({ server: startServer })]')
  )
}
