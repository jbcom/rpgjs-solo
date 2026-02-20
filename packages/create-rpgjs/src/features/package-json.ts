import path from 'node:path'
import { readJson, writeJson } from '../utils/fs.js'
import type { ScaffoldOptions } from '../core/create-project.js'

const BASE_DEPENDENCIES = {
  '@rpgjs/client': '^5.0.0-alpha.36',
  '@rpgjs/common': '^5.0.0-alpha.36',
  '@rpgjs/server': '^5.0.0-alpha.36',
  '@rpgjs/vite': '^5.0.0-alpha.36',
  '@signe/di': '^2.8.3'
}

const BASE_DEV_DEPENDENCIES = {
  vite: '^7.3.1'
}

const TYPESCRIPT_DEV_DEPENDENCIES = {
  typescript: '^5.9.3',
  '@types/node': '^25.0.0'
}

export async function configurePackageJson(
  projectDir: string,
  options: Pick<ScaffoldOptions, 'projectName' | 'features'>
): Promise<void> {
  const file = path.join(projectDir, 'package.json')
  const pkg = await readJson(file)

  pkg.name = options.projectName
  pkg.private = true
  pkg.type = 'module'
  pkg.dependencies = {
    ...BASE_DEPENDENCIES,
    ...(pkg.dependencies || {})
  }
  pkg.devDependencies = {
    ...BASE_DEV_DEPENDENCIES,
    ...(pkg.devDependencies || {})
  }

  if (options.features.typescript) {
    pkg.devDependencies = {
      ...pkg.devDependencies,
      ...TYPESCRIPT_DEV_DEPENDENCIES
    }
  }

  await writeJson(file, pkg)
}
