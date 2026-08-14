import { readFile, readdir, writeFile } from 'node:fs/promises'
import { relative, resolve, sep } from 'node:path'
import { readProductConfig } from '../src/shared/product-config.js'
import { pathExists, projectRoot, runtimeRoot } from './lib/project.js'

interface PackageDeclaration {
  name: string
  version: string
  license: string
  packagePath: string
  licenseFiles: string[]
  homepage?: string
}

const config = await readProductConfig(resolve(projectRoot, 'desktop.config.json'))
const nodeRoot = resolve(runtimeRoot, 'node', config.node.archive.slice(0, -4))
const nodeLicense = resolve(nodeRoot, 'LICENSE')
if (!await pathExists(nodeLicense)) throw new Error(`Node.js 运行时缺少许可证：${nodeLicense}`)

const packages = await scanNodeModules(resolve(runtimeRoot, 'harness', 'node_modules'))
if (!packages.some(component => component.name === config.harness.package && component.version === config.harness.version)) {
  throw new Error(`第三方声明缺少 ${config.harness.package}@${config.harness.version}。`)
}

const manifest = {
  schemaVersion: 1,
  generatedFrom: 'packaged-runtime',
  node: {
    name: 'Node.js',
    version: config.node.version,
    license: 'Node.js license',
    licenseFiles: [portable(relative(runtimeRoot, nodeLicense))],
  },
  packages,
}
await writeFile(
  resolve(runtimeRoot, 'third-party-components.json'),
  `${JSON.stringify(manifest, null, 2)}\n`,
  'utf8',
)
console.log(`第三方组件声明已生成：${packages.length} 个 npm 包。`)

async function scanNodeModules(nodeModules: string): Promise<PackageDeclaration[]> {
  const declarations: PackageDeclaration[] = []
  const visited = new Set<string>()

  async function visitModules(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name === '.bin' || entry.name === '.pnpm') continue
      const path = resolve(directory, entry.name)
      if (entry.isSymbolicLink()) throw new Error(`第三方组件目录不得包含符号链接：${path}`)
      if (!entry.isDirectory()) continue
      if (entry.name.startsWith('@')) {
        for (const scoped of await readdir(path, { withFileTypes: true })) {
          if (scoped.isSymbolicLink()) throw new Error(`第三方组件目录不得包含符号链接：${resolve(path, scoped.name)}`)
          if (!scoped.isDirectory()) continue
          await visitPackage(resolve(path, scoped.name))
        }
      } else {
        await visitPackage(path)
      }
    }
  }

  async function visitPackage(packageRoot: string): Promise<void> {
    const packageJson = resolve(packageRoot, 'package.json')
    if (!await pathExists(packageJson)) return
    const canonical = packageRoot.toLocaleLowerCase('en-US')
    if (visited.has(canonical)) return
    visited.add(canonical)
    const raw = JSON.parse(await readFile(packageJson, 'utf8')) as Record<string, unknown>
    if (typeof raw.name !== 'string' || typeof raw.version !== 'string') {
      throw new Error(`第三方 package.json 缺少 name 或 version：${packageJson}`)
    }
    const license = normalizeLicense(raw.license)
    const entries = await readdir(packageRoot, { withFileTypes: true })
    const licenseFiles = entries
      .filter(entry => entry.isFile() && /^(?:licen[cs]e|copying|notice)(?:[._-].*)?$/iu.test(entry.name))
      .map(entry => portable(relative(runtimeRoot, resolve(packageRoot, entry.name))))
      .sort()
    const declaration: PackageDeclaration = {
      name: raw.name,
      version: raw.version,
      license,
      packagePath: portable(relative(runtimeRoot, packageRoot)),
      licenseFiles,
    }
    if (typeof raw.homepage === 'string' && raw.homepage.length > 0) declaration.homepage = raw.homepage
    declarations.push(declaration)
    const nested = resolve(packageRoot, 'node_modules')
    if (await pathExists(nested)) await visitModules(nested)
  }

  await visitModules(nodeModules)
  return declarations.sort((left, right) => left.name.localeCompare(right.name)
    || left.version.localeCompare(right.version)
    || left.packagePath.localeCompare(right.packagePath))
}

function normalizeLicense(value: unknown): string {
  if (typeof value === 'string' && value.length > 0) return value
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const type = (value as Record<string, unknown>).type
    if (typeof type === 'string' && type.length > 0) return type
  }
  return 'UNKNOWN'
}

function portable(path: string): string {
  return path.split(sep).join('/')
}
