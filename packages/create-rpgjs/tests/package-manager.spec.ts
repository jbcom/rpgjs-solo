import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  detectPackageManager,
  installCommand
} from '../src/utils/package-manager.js'

const originalUserAgent = process.env.npm_config_user_agent

describe('package manager detection', () => {
  beforeEach(() => {
    delete process.env.npm_config_user_agent
  })

  afterEach(() => {
    if (originalUserAgent === undefined) {
      delete process.env.npm_config_user_agent
      return
    }
    process.env.npm_config_user_agent = originalUserAgent
  })

  it('should default to npm', () => {
    expect(detectPackageManager()).toBe('npm')
  })

  it('should detect pnpm from user agent', () => {
    process.env.npm_config_user_agent = 'pnpm/10.0.0 node/v20.0.0'
    expect(detectPackageManager()).toBe('pnpm')
  })

  it('should detect yarn from user agent', () => {
    process.env.npm_config_user_agent = 'yarn/4.0.0 npm/? node/v20.0.0'
    expect(detectPackageManager()).toBe('yarn')
  })

  it('should return proper install commands', () => {
    expect(installCommand('pnpm')).toEqual(['pnpm', ['install']])
    expect(installCommand('yarn')).toEqual(['yarn', ['install']])
    expect(installCommand('npm')).toEqual(['npm', ['install']])
  })
})
