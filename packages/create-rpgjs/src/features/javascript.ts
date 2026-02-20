import { access, rename, rm } from 'node:fs/promises'
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

export async function applyJavaScriptFeature(projectDir: string): Promise<void> {
  const viteConfigTs = path.join(projectDir, 'vite.config.ts')
  const viteConfigJs = path.join(projectDir, 'vite.config.js')

  if ((await fileExists(viteConfigTs)) && !(await fileExists(viteConfigJs))) {
    await rename(viteConfigTs, viteConfigJs)
  }

  const mainTs = path.join(projectDir, 'src', 'main.ts')
  const mainJs = path.join(projectDir, 'src', 'main.js')
  if ((await fileExists(mainTs)) && !(await fileExists(mainJs))) {
    await rename(mainTs, mainJs)
  }

  const serverTs = path.join(projectDir, 'src', 'server.ts')
  const serverJs = path.join(projectDir, 'src', 'server.js')
  if ((await fileExists(serverTs)) && !(await fileExists(serverJs))) {
    await rename(serverTs, serverJs)
  }

  const clientConfigTs = path.join(projectDir, 'src', 'config', 'client.ts')
  const clientConfigJs = path.join(projectDir, 'src', 'config', 'client.js')
  if ((await fileExists(clientConfigTs)) && !(await fileExists(clientConfigJs))) {
    await rename(clientConfigTs, clientConfigJs)
  }

  if (await fileExists(path.join(projectDir, 'tsconfig.json'))) {
    await rm(path.join(projectDir, 'tsconfig.json'), { force: true })
  }

  await replaceInFile(path.join(projectDir, 'index.html'), (content) =>
    content.replace('/src/main.ts', '/src/main.js')
  )
}
