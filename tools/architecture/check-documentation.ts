import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { PM_PROJECT_VERSION } from '@pm/project'

const root = process.cwd()
const issues: string[] = []
const files: string[] = []
const collect = (directory: string) => {
  if (!existsSync(directory)) return
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue
    const file = resolve(directory, entry.name)
    if (entry.isDirectory()) collect(file)
    else if (entry.name.endsWith('.md')) files.push(file)
  }
}
for (const directory of ['docs', '.agents', '.claude']) collect(resolve(root, directory))
for (const file of ['README.md', 'AGENTS.md', 'CLAUDE.md']) if (existsSync(file)) files.push(resolve(root, file))
let links = 0
for (const file of files) {
  const source = readFileSync(file, 'utf8')
  for (const match of source.matchAll(/!?\[[^\]]*\]\((<?[^\r\n)]+>?)\)/gu)) {
    let target = match[1].trim()
    target = target.startsWith('<') ? target.slice(1, target.indexOf('>')) : target.replace(/\s+["'][\s\S]*$/u, '')
    if (!target || target.startsWith('#') || /^[a-z][a-z\d+.-]*:/iu.test(target)) continue
    links += 1
    try {
      const path = resolve(dirname(file), decodeURIComponent(target.split('#')[0].split('?')[0]))
      if (!existsSync(path)) issues.push(`${file}: missing local link target ${target}`)
    } catch { issues.push(`${file}: malformed local link ${target}`) }
  }
}
const architecture = readFileSync('docs/08-software-architecture-and-api.md', 'utf8')
if (!architecture.includes(`PM_PROJECT_VERSION = ${PM_PROJECT_VERSION}`)) issues.push('Architecture documentation disagrees with the canonical project version.')
const gateOwner = readFileSync('docs/engineering/06-verification-acceptance-and-change-control.md', 'utf8')
const detailedGates = readFileSync('docs/09-verification-validation-and-release.md', 'utf8')
const ownerIds = [...gateOwner.matchAll(/^\| ([A-G]) — /gmu)].map((match) => match[1])
const detailedIds = [...detailedGates.matchAll(/^### Gate ([A-G]) — /gmu)].map((match) => match[1])
if (ownerIds.join('') !== 'ABCDEFG' || detailedIds.join('') !== ownerIds.join('')) issues.push('Detailed release gate IDs disagree with engineering/06.')
const pipeline = readFileSync('docs/development/04-loadings-analysis-results-and-report-pipelines.md', 'utf8')
if (pipeline.includes('It does not exist today')) issues.push('Pipeline documentation contains a retired package-existence statement.')
if (issues.length) {
  console.error(issues.join('\n'))
  process.exitCode = 1
} else console.log(`Documentation check passed: ${files.length} Markdown files, ${links} local targets, canonical schema and release-gate IDs.`)
