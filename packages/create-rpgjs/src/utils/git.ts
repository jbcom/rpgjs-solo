import { runCommand } from './process.js'

export async function initGitRepo(projectDir) {
  await runCommand('git', ['init'], { cwd: projectDir })
}

export async function createInitialCommit(projectDir) {
  await runCommand('git', ['add', '.'], { cwd: projectDir })
  await runCommand('git', ['commit', '-m', 'chore: initial commit'], { cwd: projectDir })
}
