import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import ts from 'typescript'

type Reference = { file: string; symbol: string }
type Trace = {
  id: string
  authority: string
  coverage: 'open' | 'partial-preview' | 'implemented-preview' | 'verified'
  implementation: Reference[]
  verification: { file: string; oracle: string }[]
  evidence: { command: string; record: string }[]
  reviewer: string | null
  releaseGap: string
}
const root = process.cwd(), issues: string[] = []
const scripts = JSON.parse(readFileSync('package.json', 'utf8')).scripts as Record<string, string>
const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)
const safeFile = (file: string) => resolve(root, file).startsWith(resolve(root) + '\\') ||
  resolve(root, file).startsWith(resolve(root) + '/')
const source = JSON.parse(readFileSync('docs/development/verification-matrix.json', 'utf8')) as unknown
if (!isRecord(source) || source.schema !== 'pm-verification-traceability' || source.version !== 1 || !Array.isArray(source.requirements)) {
  throw new Error('Invalid verification-matrix schema.')
}
const declared = new Map<string, string>()
for (const file of ['docs/development/01-architecture-and-package-boundaries.md', ...readdirSync('docs/engineering').filter((name) => name.endsWith('.md')).map((name) => `docs/engineering/${name}`)]) {
  for (const id of readFileSync(file, 'utf8').match(/\b(?:ENG|DEV|UNITS|REBAR)(?:-[A-Z]+)*-\d{3}\b/gu) ?? []) {
    if (declared.has(id) && declared.get(id) !== file) issues.push(`${id}: duplicated authority declaration`)
    declared.set(id, file)
  }
}
const ids = new Set<string>()
const symbols = new Map<string, Set<string>>()
const symbolExists = (reference: Reference) => {
  if (!safeFile(reference.file) || !existsSync(reference.file)) return false
  let names = symbols.get(reference.file)
  if (!names) {
    names = new Set<string>()
    const file = ts.createSourceFile(reference.file, readFileSync(reference.file, 'utf8'), ts.ScriptTarget.Latest, true)
    for (const node of file.statements) {
      if ((ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node) || ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) && node.name) names.add(node.name.text)
      if (ts.isVariableStatement(node)) for (const item of node.declarationList.declarations) if (ts.isIdentifier(item.name)) names.add(item.name.text)
    }
    symbols.set(reference.file, names)
  }
  return names.has(reference.symbol)
}
for (const value of source.requirements) {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.authority !== 'string' ||
    !['open', 'partial-preview', 'implemented-preview', 'verified'].includes(String(value.coverage)) ||
    !Array.isArray(value.implementation) || !Array.isArray(value.verification) || !Array.isArray(value.evidence) ||
    typeof value.releaseGap !== 'string' || !(value.reviewer === null || typeof value.reviewer === 'string')) {
    issues.push('Malformed traceability entry'); continue
  }
  const trace = value as unknown as Trace
  if (ids.has(trace.id)) issues.push(`${trace.id}: duplicate matrix entry`)
  ids.add(trace.id)
  if (declared.get(trace.id) !== trace.authority) issues.push(`${trace.id}: unknown or incorrect authority`)
  for (const reference of trace.implementation) {
    if (!isRecord(reference) || typeof reference.file !== 'string' || typeof reference.symbol !== 'string' || !symbolExists(reference)) issues.push(`${trace.id}: missing implementation symbol`)
  }
  for (const test of trace.verification) if (!isRecord(test) || typeof test.file !== 'string' || !safeFile(test.file) || !existsSync(test.file) || typeof test.oracle !== 'string' || test.oracle.length < 10) issues.push(`${trace.id}: missing test/oracle`)
  for (const evidence of trace.evidence) {
    const script = isRecord(evidence) && typeof evidence.command === 'string' ? /^npm run ([\w:-]+)(?: -- .*)?$/u.exec(evidence.command)?.[1] : undefined
    if (!script || !Object.hasOwn(scripts, script) || typeof evidence.record !== 'string' || !safeFile(evidence.record) || !existsSync(evidence.record)) issues.push(`${trace.id}: missing evidence command/record`)
  }
  if (trace.coverage !== 'open' && (!trace.implementation.length || !trace.verification.length || !trace.evidence.length)) issues.push(`${trace.id}: implemented claim has an orphan link`)
  if (trace.coverage === 'verified' && !trace.reviewer?.trim()) issues.push(`${trace.id}: verified claim lacks independent reviewer`)
  if (trace.coverage !== 'verified' && !trace.releaseGap.trim()) issues.push(`${trace.id}: unfinished coverage must declare its release gap`)
}
for (const id of declared.keys()) if (!ids.has(id)) issues.push(`${id}: requirement has no matrix entry`)
if (issues.length) { console.error(issues.join('\n')); process.exitCode = 1 }
else console.log(`Traceability check passed: ${ids.size} requirements linked; declared Preview/open coverage confers no release approval.`)
