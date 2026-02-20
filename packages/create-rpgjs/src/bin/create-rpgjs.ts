#!/usr/bin/env node
import { run } from '../index.js'

run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`\n[create-rpgjs] ${message}`)
  process.exit(1)
})
