import path from 'node:path'
import { access } from 'node:fs/promises'

export function detectPackageManager() {
  const userAgent = process.env.npm_config_user_agent || ''
  if (userAgent.startsWith('pnpm/')) return 'pnpm'
  if (userAgent.startsWith('yarn/')) return 'yarn'
  if (userAgent.startsWith('npm/')) return 'npm'
  return 'npm'
}

async function exists(file) {
  try {
    await access(file)
    return true
  } catch {
    return false
  }
}

export async function detectPackageManagerFromLockfile(projectDir) {
  if (await exists(path.join(projectDir, 'pnpm-lock.yaml'))) return 'pnpm'
  if (await exists(path.join(projectDir, 'yarn.lock'))) return 'yarn'
  if (await exists(path.join(projectDir, 'package-lock.json'))) return 'npm'
  return detectPackageManager()
}

export function installCommand(packageManager) {
  if (packageManager === 'pnpm') return ['pnpm', ['install']]
  if (packageManager === 'yarn') return ['yarn', ['install']]
  return ['npm', ['install']]
}
