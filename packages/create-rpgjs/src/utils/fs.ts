import { mkdir, readdir, rm, cp, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

export async function ensureEmptyDir(dir, { overwrite = false } = {}) {
  await mkdir(dir, { recursive: true })
  const entries = await readdir(dir)
  if (entries.length === 0) return
  if (!overwrite) {
    throw new Error('TARGET_NOT_EMPTY')
  }
  await rm(dir, { recursive: true, force: true })
  await mkdir(dir, { recursive: true })
}

export async function copyTemplate(templateDir, destinationDir) {
  await cp(templateDir, destinationDir, { recursive: true })
}

export async function readJson(file) {
  const content = await readFile(file, 'utf8')
  return JSON.parse(content)
}

export async function writeJson(file, data) {
  const json = `${JSON.stringify(data, null, 2)}\n`
  await writeFile(file, json, 'utf8')
}

export async function replaceInFile(file, replacer) {
  const content = await readFile(file, 'utf8')
  await writeFile(file, replacer(content), 'utf8')
}

export function resolveTemplateDir(templateName = 'base') {
  const templateUrl = new URL(`../../template/${templateName}`, import.meta.url)
  return fileURLToPath(templateUrl)
}
