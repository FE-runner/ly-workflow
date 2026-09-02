import { describe, expect, it } from 'vitest'
import { createDefaultConfig, createDefaultRouting, isValidImplementerBackend, isValidRoutingBackend } from '../config'

describe('routing backend whitelists', () => {
  it('isValidRoutingBackend accepts codex/hermes/openclaw and rejects claude', () => {
    expect(isValidRoutingBackend('codex')).toBe(true)
    expect(isValidRoutingBackend('hermes')).toBe(true)
    expect(isValidRoutingBackend('openclaw')).toBe(true)
    expect(isValidRoutingBackend('claude')).toBe(false)
    expect(isValidRoutingBackend('gemini')).toBe(false)
    expect(isValidRoutingBackend(undefined)).toBe(false)
  })

  it('isValidImplementerBackend accepts claude/codex/hermes/openclaw', () => {
    expect(isValidImplementerBackend('claude')).toBe(true)
    expect(isValidImplementerBackend('codex')).toBe(true)
    expect(isValidImplementerBackend('hermes')).toBe(true)
    expect(isValidImplementerBackend('openclaw')).toBe(true)
  })

  it('isValidImplementerBackend rejects illegal values', () => {
    expect(isValidImplementerBackend('gemini')).toBe(false)
    expect(isValidImplementerBackend('grok')).toBe(false)
    expect(isValidImplementerBackend('')).toBe(false)
    expect(isValidImplementerBackend(42)).toBe(false)
  })
})

describe('createDefaultRouting', () => {
  it('returns codex as default reviewer', () => {
    const routing = createDefaultRouting()
    expect(routing.reviewer).toBe('codex')
  })

  it('returns claude as default implementer', () => {
    const routing = createDefaultRouting()
    expect(routing.implementer).toBe('claude')
  })
})

describe('createDefaultConfig', () => {
  const baseOptions = {
    language: 'zh-CN' as const,
    routing: createDefaultRouting(),
    installedWorkflows: ['init-project', 'commit'],
  }

  it('sets version from package.json', () => {
    const config = createDefaultConfig(baseOptions)
    // version should be a semver string
    expect(config.general.version).toMatch(/^\d+\.\d+\.\d+/)
  })

  it('sets language correctly', () => {
    const config = createDefaultConfig(baseOptions)
    expect(config.general.language).toBe('zh-CN')
  })

  it('sets createdAt as ISO string', () => {
    const config = createDefaultConfig(baseOptions)
    // Should parse without error
    expect(() => new Date(config.general.createdAt)).not.toThrow()
    expect(new Date(config.general.createdAt).toISOString()).toBe(config.general.createdAt)
  })

  it('stores installed workflows', () => {
    const config = createDefaultConfig(baseOptions)
    expect(config.workflows.installed).toEqual(['init-project', 'commit'])
  })

  it('defaults mcpProvider to fast-context', () => {
    const config = createDefaultConfig(baseOptions)
    expect(config.mcp.provider).toBe('fast-context')
  })

  it('respects custom mcpProvider', () => {
    const config = createDefaultConfig({ ...baseOptions, mcpProvider: 'contextweaver' })
    expect(config.mcp.provider).toBe('contextweaver')
  })

  it('defaults liteMode to false', () => {
    const config = createDefaultConfig(baseOptions)
    expect(config.performance?.liteMode).toBe(false)
  })

  it('respects liteMode = true', () => {
    const config = createDefaultConfig({ ...baseOptions, liteMode: true })
    expect(config.performance?.liteMode).toBe(true)
  })

  it('sets paths with home directory', () => {
    const config = createDefaultConfig(baseOptions)
    expect(config.paths.commands).toContain('.claude')
    expect(config.paths.prompts).toContain('.ly')
    expect(config.paths.backup).toContain('.ly')
  })

  it('preserves routing config exactly', () => {
    const routing = createDefaultRouting()
    const config = createDefaultConfig({ ...baseOptions, routing })
    expect(config.routing).toEqual(routing)
  })
})
