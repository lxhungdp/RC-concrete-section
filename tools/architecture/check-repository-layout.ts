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

if (issues.length > 0) {
  console.error('Repository structure check failed:')
  for (const issue of issues) console.error(`- ${issue}`)
  process.exitCode = 1
} else {
  console.log('Repository structure check passed.')
}
