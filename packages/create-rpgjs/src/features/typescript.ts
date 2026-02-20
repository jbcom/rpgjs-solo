import { access, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { replaceInFile } from '../utils/fs.js'

async function fileExists(file: string): Promise<boolean> {
  try {
    await access(file)
    return true
  } catch {
    return false
  }
}

export async function applyTypeScriptFeature(projectDir: string): Promise<void> {
  const viteConfigJs = path.join(projectDir, 'vite.config.js')
  const viteConfigTs = path.join(projectDir, 'vite.config.ts')

  if ((await fileExists(viteConfigJs)) && !(await fileExists(viteConfigTs))) {
    await rename(viteConfigJs, viteConfigTs)
  }

  const mainJs = path.join(projectDir, 'src', 'main.js')
  const mainTs = path.join(projectDir, 'src', 'main.ts')
  if ((await fileExists(mainJs)) && !(await fileExists(mainTs))) {
    await rename(mainJs, mainTs)
  }

  const serverJs = path.join(projectDir, 'src', 'server.js')
  const serverTs = path.join(projectDir, 'src', 'server.ts')
  if ((await fileExists(serverJs)) && !(await fileExists(serverTs))) {
    await rename(serverJs, serverTs)
  }

  const clientConfigJs = path.join(projectDir, 'src', 'config', 'client.js')
  const clientConfigTs = path.join(projectDir, 'src', 'config', 'client.ts')
  if ((await fileExists(clientConfigJs)) && !(await fileExists(clientConfigTs))) {
    await rename(clientConfigJs, clientConfigTs)
  }

  await writeFile(
    path.join(projectDir, 'tsconfig.json'),
    JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2022',
          module: 'ESNext',
          moduleResolution: 'Bundler',
          strict: true,
          skipLibCheck: true,
          baseUrl: '.',
          paths: {
            '@/*': ['src/*']
          },
          types: ['node']
        },
        include: ['src', 'vite.config.ts']
      },
      null,
      2
    ) + '\n',
    'utf8'
  )

  await replaceInFile(path.join(projectDir, 'index.html'), (content) =>
    content.replace('/src/main.js', '/src/main.ts')
  )
}
