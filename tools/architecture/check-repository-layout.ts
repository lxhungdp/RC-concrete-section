import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { relative, resolve } from 'node:path'

const root = process.cwd()
const issues: string[] = []
const codeRoots = ['apps', 'packages', 'tools', 'bench']
const sourceExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'])

const normalized = (path: string) => path.replace(/\\/g, '/')
const extension = (path: string) => {
  const index = path.lastIndexOf('.')
  return index < 0 ? '' : path.slice(index)
}

const walk = (directory: string, visit: (path: string, isDirectory: boolean) => void) => {
  if (!existsSync(directory)) return
  for (const entry of readdirSync(directory)) {
    const path = resolve(directory, entry)
    const isDirectory = statSync(path).isDirectory()
    visit(path, isDirectory)
    if (isDirectory) walk(path, visit)
  }
}

for (const instructionFile of ['AGENTS.md', 'CLAUDE.md']) {
  const instructionPath = resolve(root, instructionFile)
  if (!existsSync(instructionPath)) {
    issues.push(`${instructionFile}: root agent instruction file is required`)
    continue
  }
  const lineCount = readFileSync(instructionPath, 'utf8').split(/\r?\n/).length
  if (lineCount > 200) issues.push(`${instructionFile}: root agent instructions must stay within 200 lines`)
}

const claudeInstructions = resolve(root, 'CLAUDE.md')
if (existsSync(claudeInstructions) && !/^@AGENTS\.md(?:\r?\n|$)/.test(readFileSync(claudeInstructions, 'utf8'))) {
  issues.push('CLAUDE.md: the first line must import the shared @AGENTS.md contract')
}

type SkillIdentity = {
  name: string
  description: string
  text: string
}

const portableSkillFields = new Set(['name', 'description'])

const readSkillIdentity = (skillPath: string, projectPath: string): SkillIdentity | undefined => {
  const text = readFileSync(skillPath, 'utf8')
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text)
  if (!frontmatter) {
    issues.push(`${projectPath}: SKILL.md requires YAML frontmatter`)
    return undefined
  }

  const fields = new Map<string, string>()
  for (const line of frontmatter[1].split(/\r?\n/)) {
    if (line.trim().length === 0 || line.trimStart().startsWith('#')) continue
    const field = /^([a-z][a-z0-9-]*):(?:\s*(.*))?$/.exec(line)
    if (!field) {
      issues.push(`${projectPath}: shared skill frontmatter must use simple top-level fields`)
      continue
    }
    if (!portableSkillFields.has(field[1])) {
      issues.push(`${projectPath}: frontmatter field "${field[1]}" is not approved for shared skills`)
    }
    fields.set(field[1], field[2]?.trim() ?? '')
  }

  const name = fields.get('name') ?? ''
  const description = fields.get('description') ?? ''
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name) || name.length > 64) {
    issues.push(`${projectPath}: name must be a lower-case hyphenated skill name of at most 64 characters`)
  }
  if (description.length === 0 || description.length > 1024) {
    issues.push(`${projectPath}: description must contain 1-1024 characters`)
  }

  return { name, description, text }
}

const collectSkills = (directory: string, projectDirectory: string) => {
  const skills = new Map<string, SkillIdentity>()
  if (!existsSync(directory)) {
    issues.push(`${projectDirectory}: shared skill discovery directory is required`)
    return skills
  }

  for (const entry of readdirSync(directory)) {
    const skillDirectory = resolve(directory, entry)
    if (!statSync(skillDirectory).isDirectory()) {
      issues.push(`${projectDirectory}/${entry}: skill roots may contain only skill directories`)
      continue
    }
    const skillPath = resolve(skillDirectory, 'SKILL.md')
    const projectPath = `${projectDirectory}/${entry}/SKILL.md`
    if (!existsSync(skillPath)) {
      issues.push(`${projectPath}: every skill directory requires SKILL.md`)
      continue
    }
    const skill = readSkillIdentity(skillPath, projectPath)
    if (!skill) continue
    if (skill.name !== entry) issues.push(`${projectPath}: frontmatter name must match its directory`)
    skills.set(entry, skill)
  }

  return skills
}

for (const codeRoot of codeRoots) {
  walk(resolve(root, codeRoot), (path, isDirectory) => {
    const projectPath = normalized(relative(root, path))
    if (isDirectory) {
      if (projectPath.split('/').some((segment) => segment.includes(' '))) {
        issues.push(`${projectPath}: code/tool directory names may not contain spaces`)
      }
      return
    }

    if (
      projectPath.startsWith('packages/') &&
      projectPath.includes('/src/') &&
      (/\.test\.[cm]?[jt]sx?$/.test(projectPath) || /\.selftest\.[cm]?[jt]sx?$/.test(projectPath))
    ) {
      issues.push(`${projectPath}: production src may not contain test or self-test files`)
    }

    if (!sourceExtensions.has(extension(projectPath))) return
    const text = readFileSync(path, 'utf8')

    if (projectPath.startsWith('packages/') && /(?:from\s*|import\s*\()['"][^'"]*apps\//.test(text)) {
      issues.push(`${projectPath}: workspace packages may not import application code`)
    }

    if (
      projectPath.startsWith('apps/web/application/') &&
      /(?:from\s*|import\s*\()['"][^'"]*workers\//.test(text)
    ) {
      issues.push(`${projectPath}: application code must depend on a worker contract, not worker runtime`)
    }
  })
}

const forbiddenLegacyPaths = [
  'apps/web/components/section-editor',
  'apps/web/lib/workers',
  'docs/example',
  'docs/example case'
]

const requiredStandardAdapters = [
  'packages/pm-code-kds142020',
  'packages/pm-code-aci318',
  'packages/pm-code-en1992',
  'packages/pm-code-as3600'
]

for (const adapterPath of requiredStandardAdapters) {
  if (!existsSync(resolve(root, adapterPath, 'src/index.ts'))) {
    issues.push(`${adapterPath}: selectable standards require a code-owned adapter entry point`)
  }
  if (!existsSync(resolve(root, adapterPath, 'test'))) {
    issues.push(`${adapterPath}: code adapters require a package-local test directory`)
  }
}

for (const legacyTool of [
  'tools/generate-equivalent-block-examples.ts',
  'tools/p16-umd-comparison.ts',
  'tools/p16-umd-verification.ts'
]) {
  if (existsSync(resolve(root, legacyTool))) issues.push(`${legacyTool}: legacy root tool must not be recreated`)
}

const reportRoot = resolve(root, 'packages/pm-report/src')
if (existsSync(reportRoot)) {
  const allowedFacades = new Set(['index.ts', 'report-model.ts'])
  for (const entry of readdirSync(reportRoot)) {
    const path = resolve(reportRoot, entry)
    if (statSync(path).isFile() && sourceExtensions.has(extension(entry)) && !allowedFacades.has(entry)) {
      issues.push(`packages/pm-report/src/${entry}: report implementations belong in a concern folder`)
    }
  }
}

for (const legacyPath of forbiddenLegacyPaths) {
  if (existsSync(resolve(root, legacyPath))) issues.push(`${legacyPath}: legacy layout must not be recreated`)
}

const canonicalSkills = collectSkills(resolve(root, '.agents/skills'), '.agents/skills')
const claudeSkills = collectSkills(resolve(root, '.claude/skills'), '.claude/skills')

for (const [name, canonical] of canonicalSkills) {
  const adapter = claudeSkills.get(name)
  if (!adapter) {
    issues.push(`.claude/skills/${name}: every canonical skill requires a Claude Code adapter`)
    continue
  }
  if (adapter.name !== canonical.name || adapter.description !== canonical.description) {
    issues.push(`.claude/skills/${name}/SKILL.md: name and description must match the canonical skill`)
  }
  const canonicalLink = `../../../.agents/skills/${name}/SKILL.md`
  if (!adapter.text.includes(canonicalLink)) {
    issues.push(`.claude/skills/${name}/SKILL.md: adapter must link to ${canonicalLink}`)
  }
}

for (const name of claudeSkills.keys()) {
  if (!canonicalSkills.has(name)) {
    issues.push(`.claude/skills/${name}: adapter has no matching canonical skill`)
  }
}

if (issues.length > 0) {
  console.error('Repository structure check failed:')
  for (const issue of issues) console.error(`- ${issue}`)
  process.exitCode = 1
} else {
  console.log('Repository structure check passed.')
}
