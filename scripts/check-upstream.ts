import { appendFile } from 'node:fs/promises'
import { isAbsolute, resolve } from 'node:path'
import { readProductConfig } from '../src/shared/product-config.js'
import { projectRoot } from './lib/project.js'
import { readPublishedHarness } from './lib/npm-registry.js'

const config = await readProductConfig(resolve(projectRoot, 'desktop.config.json'))
const published = await readPublishedHarness()
const available = published.version !== config.harness.version
const result = {
  currentVersion: config.harness.version,
  latestVersion: published.version,
  updateAvailable: available,
  integrity: published.integrity,
  tarball: published.tarball,
}
console.log(JSON.stringify(result, null, 2))

const githubOutput = process.env.GITHUB_OUTPUT
if (githubOutput !== undefined) {
  if (!isAbsolute(githubOutput)) throw new Error('GITHUB_OUTPUT 必须是绝对路径。')
  await appendFile(githubOutput, `update_available=${String(available)}\nversion=${published.version}\n`, 'utf8')
}
