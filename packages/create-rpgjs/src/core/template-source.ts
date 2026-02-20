import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { resolveTemplateDir } from '../utils/fs.js'

function cloneRepository(url, destination) {
  return new Promise((resolve, reject) => {
    const child = spawn('git', ['clone', '--depth', '1', url, destination], {
      stdio: ['ignore', 'inherit', 'pipe'],
      shell: process.platform === 'win32'
    })

    let stderr = ''
    child.stderr.on('data', (chunk) => {
      const text = chunk.toString()
      stderr += text
      process.stderr.write(text)
    })

    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) {
        resolve()
        return
      }
      reject(new Error(stderr.trim() || `git clone failed with exit code ${code}`))
    })
  })
}

export async function resolveTemplateSource(options = {}) {
  if (!options.templateUrl) {
    return {
      templateDir: resolveTemplateDir(options.templateName || 'base'),
      cleanup: async () => {}
    }
  }

  const tempRoot = await mkdtemp(path.join(tmpdir(), 'create-rpgjs-'))
  const destination = path.join(tempRoot, 'template')

  try {
    await cloneRepository(options.templateUrl, destination)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const lowered = message.toLowerCase()
    const networkHint =
      lowered.includes('unable to access') ||
      lowered.includes('could not resolve host') ||
      lowered.includes('failed to connect')

    if (networkHint) {
      throw new Error(`Failed to clone template repository (network issue): ${message}`)
    }

    throw new Error(`Failed to clone template repository: ${message}`)
  }

  return {
    templateDir: destination,
    cleanup: async () => {
      await rm(tempRoot, { recursive: true, force: true })
    }
  }
}
