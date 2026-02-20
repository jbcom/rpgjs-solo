import { createInterface } from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'

export interface PromptResult {
  projectName: string
  features: {
    typescript: boolean
    multiplayer: boolean
    git: boolean
    firstCommit: boolean
    install: boolean
  }
}

function toBoolean(value: string, defaultValue = true): boolean {
  if (!value) return defaultValue
  const normalized = value.trim().toLowerCase()
  if (['y', 'yes', 'o', 'oui'].includes(normalized)) return true
  if (['n', 'no', 'non'].includes(normalized)) return false
  return defaultValue
}

export async function askProjectOptions(defaultName = 'my-rpgjs-game'): Promise<PromptResult> {
  const rl = createInterface({ input, output })
  try {
    const projectNameRaw = await rl.question(`Project name (${defaultName}): `)
    const projectName = projectNameRaw.trim() || defaultName

    const useTypeScript = toBoolean(await rl.question('Add TypeScript support? (Y/n): '), true)
    const useMultiplayer = toBoolean(await rl.question('Enable multiplayer setup? (Y/n): '), true)
    const initGit = toBoolean(await rl.question('Initialize a Git repository? (Y/n): '), true)
    const createFirstCommit = initGit
      ? toBoolean(await rl.question('Create initial commit? (Y/n): '), true)
      : false
    const installDependencies = toBoolean(await rl.question('Install dependencies now? (Y/n): '), true)

    return {
      projectName,
      features: {
        typescript: useTypeScript,
        multiplayer: useMultiplayer,
        git: initGit,
        firstCommit: createFirstCommit,
        install: installDependencies
      }
    }
  } finally {
    rl.close()
  }
}

export async function confirmOverwrite(projectName: string): Promise<boolean> {
  const rl = createInterface({ input, output })
  try {
    const answer = await rl.question(
      `Directory "${projectName}" exists and is not empty. Overwrite? (y/N): `
    )
    return toBoolean(answer, false)
  } finally {
    rl.close()
  }
}
