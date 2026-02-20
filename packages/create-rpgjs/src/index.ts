import path from 'node:path'
import { askProjectOptions, confirmOverwrite } from './cli/prompts.js'
import { ui } from './utils/terminal.js'
import { scaffoldProject } from './core/create-project.js'
import { readdir } from 'node:fs/promises'

interface ParsedArgs {
  projectName: string
  templateName: string
  templateUrl?: string
}

function normalizeName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, '-')
    .replace(/^-+|-+$/g, '')
}

function parseArgs(): ParsedArgs {
  const args = process.argv.slice(2)
  const options: ParsedArgs = {
    projectName: '',
    templateName: 'base',
    templateUrl: undefined
  }

  for (let index = 0; index < args.length; index += 1) {
    const value = args[index]
    if (!value) continue

    if (value === '--template' && args[index + 1]) {
      options.templateName = args[index + 1]
      index += 1
      continue
    }

    if (value === '--template-url' && args[index + 1]) {
      options.templateUrl = args[index + 1]
      index += 1
      continue
    }

    if (!value.startsWith('-') && !options.projectName) {
      options.projectName = value
    }
  }

  return options
}

async function hasFiles(dir: string): Promise<boolean> {
  try {
    const entries = await readdir(dir)
    return entries.length > 0
  } catch {
    return false
  }
}

export async function run(): Promise<void> {
  ui.title('create-rpgjs')

  const parsedArgs = parseArgs()
  const answers = await askProjectOptions(parsedArgs.projectName || 'my-rpgjs-game')
  const projectName = normalizeName(answers.projectName)

  if (!projectName) {
    throw new Error('Invalid project name.')
  }

  const targetDir = path.resolve(process.cwd(), projectName)
  let overwrite = false

  if (await hasFiles(targetDir)) {
    overwrite = await confirmOverwrite(projectName)
    if (!overwrite) {
      ui.warn('Operation cancelled by user.')
      return
    }
  }

  await scaffoldProject(process.cwd(), {
    ...answers,
    projectName,
    overwrite,
    templateName: parsedArgs.templateName,
    templateUrl: parsedArgs.templateUrl
  })
}
