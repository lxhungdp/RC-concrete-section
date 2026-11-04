import assert from 'node:assert/strict'
import test from 'node:test'
import { inspectWorkspaceDependencies, type WorkspaceDefinition } from './workspace-dependencies'

const packages: WorkspaceDefinition[] = [
  { name: '@pm/a', directory: '/workspace/packages/a', exports: { '.': './src/index.ts' }, dependencies: { '@pm/b': '0.1.0' } },
  { name: '@pm/b', directory: '/workspace/packages/b', exports: { '.': './src/index.ts', './public': './src/public.ts' }, dependencies: { '@pm/a': '0.1.0' } }
]
test('DEV-ARCH-001/002: static and type-only cycles/private imports fail while public subpaths pass', () => {
  assert.deepEqual(inspectWorkspaceDependencies(packages, [{ path: '/workspace/packages/a/src/index.ts', text: "export * from '@pm/b/public'" }]), [])
  const issues = inspectWorkspaceDependencies(packages, [
    { path: '/workspace/packages/a/src/index.ts', text: "import type { T } from '@pm/b/private'" },
    { path: '/workspace/packages/b/src/index.ts', text: "const other = import('@pm/a')" }
  ])
  assert.ok(issues.some((issue) => issue.includes('not a public export')))
  assert.ok(issues.some((issue) => issue.includes('dependency cycle')))
})
test('DEV-ARCH-002/003: relative bypass and undeclared hoisted dependencies are rejected', () => {
  const issues = inspectWorkspaceDependencies(packages, [{
    path: '/workspace/packages/a/src/index.ts',
    text: "import '.././../b/src/internal'; import ExcelJS from 'exceljs'"
  }])
  assert.ok(issues.some((issue) => issue.includes('relative import')))
  assert.ok(issues.some((issue) => issue.includes('missing from')))
})

test('DEV-ARCH-003/005: declared dependencies cannot authorize upward or concrete-adapter imports', () => {
  const inputs: WorkspaceDefinition[] = [
    { name: '@pm/equivalent-block', directory: '/workspace/packages/kernel', dependencies: { '@pm/web': '0.1.0', '@pm/code-kds': '0.1.0' } },
    { name: '@pm/web', directory: '/workspace/apps/web', exports: { import: './src/index.ts' } },
    { name: '@pm/code-kds', directory: '/workspace/packages/code', exports: './src/index.ts' }
  ]
  const issues = inspectWorkspaceDependencies(inputs, [{ path: '/workspace/packages/kernel/src/index.ts',
    text: "import '@pm/web'; import '@pm/code-kds'" }])
  assert.ok(issues.some((issue) => issue.includes('application code')))
  assert.ok(issues.some((issue) => issue.includes('cannot select a code adapter')))
  const upward = inspectWorkspaceDependencies([
    { name: '@pm/materials', directory: '/workspace/packages/materials', dependencies: { '@pm/report': '0.1.0' } },
    { name: '@pm/report', directory: '/workspace/packages/report', exports: './src/index.ts' }
  ], [{ path: '/workspace/packages/materials/src/index.ts', text: "import '@pm/report'; import '../../../tools/private'" }])
  assert.ok(upward.some((issue) => issue.includes('cannot import presentation adapters')))
  assert.ok(upward.some((issue) => issue.includes('escapes the owning')))
})
