import { describe, it, expect } from 'vitest'
import { directivePlugin } from '../src/directive-plugin'

const pluginClient = directivePlugin({ side: 'client' })
const pluginServer = directivePlugin({ side: 'server' })

const fileSource = `'use client';\nexport function hello(){ return 'hi' }`
const funcSource = `export function foo(){\n  'use server';\n  return 1;\n}\nexport const bar = () => {\n  'use client';\n  return 2;\n}`

describe('directivePlugin', () => {
  it('keeps file for matching side', async () => {
    const res = await pluginClient.transform(fileSource, 'file.ts') as any
    expect(res.code).toContain("export function hello")
    expect(res.code).not.toContain('use client')
  })

  it('removes file for opposite side', async () => {
    const res = await pluginServer.transform(fileSource, 'file.ts') as any
    expect(res.code.trim()).toBe('export default null;')
  })

  it('keeps function for matching side', async () => {
    const res = await pluginServer.transform(funcSource, 'func.ts') as any
    expect(res.code).toContain('function foo()')
    expect(res.code).not.toContain('use server')
    expect(res.code).not.toContain('bar') // bar should be removed on server
  })

  it('removes function for opposite side', async () => {
    const res = await pluginClient.transform(funcSource, 'func.ts') as any
    expect(res.code).toContain('bar')
    expect(res.code).not.toContain('foo')
  })
})
