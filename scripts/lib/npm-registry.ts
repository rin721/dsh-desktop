export interface PublishedPackage {
  name: '@deepseek-ai/dsh'
  version: string
  integrity: `sha512-${string}`
  tarball: string
}

/** 从官方 npm 注册表读取并严格验证一个 Harness 发布物。 */
export async function readPublishedHarness(version = 'latest'): Promise<PublishedPackage> {
  const response = await fetch(`https://registry.npmjs.org/@deepseek-ai%2Fdsh/${encodeURIComponent(version)}`, {
    headers: { accept: 'application/json' },
    redirect: 'error',
  })
  if (!response.ok) throw new Error(`读取官方 Harness 包元数据失败：HTTP ${response.status}`)
  const raw = await response.json() as Record<string, unknown>
  if (raw.name !== '@deepseek-ai/dsh' || typeof raw.version !== 'string' || !/^[0-9A-Za-z.-]+$/u.test(raw.version)) {
    throw new Error('官方 Harness 包元数据缺少安全的 name/version。')
  }
  if (typeof raw.dist !== 'object' || raw.dist === null || Array.isArray(raw.dist)) throw new Error('官方 Harness 包元数据缺少 dist。')
  const dist = raw.dist as Record<string, unknown>
  if (typeof dist.integrity !== 'string' || !dist.integrity.startsWith('sha512-')) throw new Error('官方 Harness 包缺少 sha512 SRI。')
  const expectedTarball = `https://registry.npmjs.org/@deepseek-ai/dsh/-/dsh-${raw.version}.tgz`
  if (dist.tarball !== expectedTarball) throw new Error('官方 Harness tarball URL 与精确版本不一致。')
  return {
    name: '@deepseek-ai/dsh',
    version: raw.version,
    integrity: dist.integrity as `sha512-${string}`,
    tarball: expectedTarball,
  }
}
