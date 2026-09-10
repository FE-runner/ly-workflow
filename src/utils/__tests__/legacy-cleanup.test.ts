import { describe, expect, it } from 'vitest'
import { cleanupLegacyArtifacts } from '../legacy-cleanup'

/**
 * 说明：legacy-cleanup 以模块级 homedir() 定位目标路径（不可注入），
 * 本测试验证在当前机器上的真实运行：结构合法、单项失败不抛出、幂等
 * （第二次运行 cleaned 为空且全部 skipped）。清理项的真实增删路径由
 * 8.3 实跑与 /ly:verify-change 覆盖。
 */
describe('cleanupLegacyArtifacts', () => {
  it('返回结构合法的三段清单且不抛出', async () => {
    const r = await cleanupLegacyArtifacts()
    expect(Array.isArray(r.cleaned)).toBe(true)
    expect(Array.isArray(r.skipped)).toBe(true)
    expect(Array.isArray(r.failed)).toBe(true)
    // 每一项都带来源标注
    expect([...r.cleaned, ...r.skipped].every(s => typeof s === 'string' && s.length > 0)).toBe(true)
  })

  it('幂等：第二次运行无新增 cleaned', async () => {
    const first = await cleanupLegacyArtifacts()
    const second = await cleanupLegacyArtifacts()
    expect(second.cleaned.length).toBe(0)
    // skipped 至少覆盖所有清理项（存在才清，不存在跳过）
    expect(second.skipped.length).toBeGreaterThan(0)
    void first
  })
})
