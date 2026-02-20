import path from 'node:path'
import { ensureEmptyDir, copyTemplate, replaceInFile } from '../utils/fs.js'
import { spinner, ui } from '../utils/terminal.js'
import { configurePackageJson } from '../features/package-json.js'
import { applyTypeScriptFeature } from '../features/typescript.js'
import { applyJavaScriptFeature } from '../features/javascript.js'
import { applyMultiplayerFeature } from '../features/multiplayer.js'
import { detectPackageManagerFromLockfile, installCommand } from '../utils/package-manager.js'
import { runCommand } from '../utils/process.js'
import { initGitRepo, createInitialCommit } from '../utils/git.js'
import { resolveTemplateSource } from './template-source.js'

export interface FeatureFlags {
  typescript: boolean
  multiplayer: boolean
  git: boolean
  firstCommit: boolean
  install: boolean
}

export interface ScaffoldOptions {
  projectName: string
  overwrite: boolean
  templateName?: string
  templateUrl?: string
  features: FeatureFlags
}

export async function scaffoldProject(cwd: string, options: ScaffoldOptions): Promise<void> {
  const projectDir = path.resolve(cwd, options.projectName)
  let templateCleanup: () => Promise<void> = async () => {}

  await ensureEmptyDir(projectDir, { overwrite: options.overwrite })

  const copySpin = spinner('Copying base template')
  copySpin.start()
  try {
    const templateSource = await resolveTemplateSource(options)
    templateCleanup = templateSource.cleanup
    await copyTemplate(templateSource.templateDir, projectDir)
    copySpin.stop('Base template copied')
  } catch (error) {
    copySpin.fail('Failed to copy base template')
    throw error
  } finally {
    await templateCleanup()
  }

  const configureSpin = spinner('Configuring project')
  configureSpin.start()
  try {
    await configurePackageJson(projectDir, options)
    await replaceInFile(path.join(projectDir, 'README.md'), (content) =>
      content.replaceAll('__PROJECT_NAME__', options.projectName)
    )

    if (options.features.typescript) {
      await applyTypeScriptFeature(projectDir)
    } else {
      await applyJavaScriptFeature(projectDir)
    }

    if (options.features.multiplayer) {
      await applyMultiplayerFeature(projectDir, {
        typescript: options.features.typescript
      })
    }

    configureSpin.stop('Features applied')
  } catch (error) {
    configureSpin.fail('Failed to configure project')
    throw error
  }

  let packageManager = await detectPackageManagerFromLockfile(projectDir)
  if (!packageManager) packageManager = 'npm'

  if (options.features.install) {
    const installSpin = spinner(`Installing dependencies (${packageManager})`)
    installSpin.start()
    try {
      const [command, args] = installCommand(packageManager)
      await runCommand(command, args, { cwd: projectDir })
      installSpin.stop('Dependencies installed')
    } catch (error) {
      installSpin.fail('Dependency installation failed')
      throw error
    }
  }

  if (options.features.git) {
    const gitSpin = spinner('Initializing Git repository')
    gitSpin.start()
    try {
      await initGitRepo(projectDir)
      if (options.features.firstCommit) {
        try {
          await createInitialCommit(projectDir)
        } catch (error) {
          ui.warn(
            'Git repository initialized, but initial commit failed (check git user.name/user.email).'
          )
          ui.muted(error instanceof Error ? error.message : String(error))
        }
      }
      gitSpin.stop('Git repository ready')
    } catch (error) {
      gitSpin.fail('Git initialization failed')
      throw error
    }
  }

  const enabledFeatures = Object.entries(options.features)
    .filter(([, enabled]) => enabled)
    .map(([name]) => name)

  ui.success(`Project ${options.projectName} created at ${projectDir}`)
  ui.muted('\nSummary:')
  ui.muted(`  Template: ${options.templateName || 'base'}`)
  ui.muted(`  Package manager: ${packageManager}`)
  ui.muted(`  Features: ${enabledFeatures.length ? enabledFeatures.join(', ') : 'none'}`)

  ui.muted('\nNext steps:')
  ui.muted(`  cd ${options.projectName}`)
  if (!options.features.install) {
    ui.muted(`  ${packageManager} install`)
  }
  ui.muted(`  ${packageManager === 'yarn' ? 'yarn dev' : `${packageManager} run dev`}`)
}
