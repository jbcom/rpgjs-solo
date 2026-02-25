import { spawn } from 'node:child_process'

type RunCommandOptions = Parameters<typeof spawn>[2]

export function runCommand(command: string, args: string[], options: RunCommandOptions = {}): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: process.platform === 'win32',
      ...options
    })

    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) {
        resolve()
        return
      }
      reject(new Error(`${command} ${args.join(' ')} failed with exit code ${code}`))
    })
  })
}
