import { dirname, resolve } from 'node:path'
import ts from 'typescript'

export type WorkspaceDefinition = {
  name: string
  directory: string
  exports?: string | Record<string, unknown>
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}
export type WorkspaceSource = { path: string; text: string }
const normalized = (path: string) => resolve(path).replace(/\\/g, '/')

/** AST inspection includes type imports, re-exports and static dynamic imports. */
export const inspectWorkspaceDependencies = (
  workspaces: readonly WorkspaceDefinition[], sources: readonly WorkspaceSource[]
): string[] => {
  const issues: string[] = []
  const packages = new Map(workspaces.map((workspace) => [workspace.name, workspace]))
  const graph = new Map(workspaces.map(({ name }) => [name, new Set<string>()]))
  const ownerOf = (file: string) => workspaces.find(({ directory }) =>
    normalized(file).startsWith(normalized(directory) + '/'))

  for (const input of sources) {
    const owner = ownerOf(input.path)
    if (!owner) continue
    const source = ts.createSourceFile(input.path, input.text, ts.ScriptTarget.Latest, true)
    const inspect = (specifier: string, position: number) => {
      const line = source.getLineAndCharacterOfPosition(position).line + 1
      const location = `${input.path}:${line}`
      if (specifier.startsWith('.')) {
        const targetPath = resolve(dirname(input.path), specifier)
        const target = ownerOf(targetPath)
        if (target && target.name !== owner.name) issues.push(`${location}: cross-package relative import bypasses ${target.name} public exports`)
        else if (!target && !normalized(owner.directory).includes('/apps/') &&
          !normalized(targetPath).startsWith(normalized(owner.directory) + '/')) issues.push(`${location}: relative import escapes the owning workspace package`)
        return
      }
      if (specifier.startsWith('node:')) {
        if (owner.name.startsWith('@pm/') && owner.name !== '@pm/web' && owner.name !== '@pm/report') {
          issues.push(`${location}: canonical packages cannot import Node runtime APIs`)
        }
        return
      }
      const dependency = specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0]
      const target = packages.get(dependency)
      if (owner.name !== '@pm/web' && target?.directory.replace(/\\/gu, '/').includes('/apps/')) {
        issues.push(`${location}: workspace packages cannot import application code`)
      }
      if (target) {
        if (target.name !== owner.name) graph.get(owner.name)!.add(target.name)
        const subpath = specifier.slice(dependency.length)
        const key = subpath ? `.${subpath}` : '.'
        const exports = target.exports
        const allowed = typeof exports === 'string' ? key === '.' : exports
          ? !Object.keys(exports).some((entry) => entry.startsWith('.')) ? key === '.' : Object.keys(exports).some((entry) => entry === key || entry.includes('*') &&
            key.startsWith(entry.split('*')[0]) && key.endsWith(entry.split('*')[1]))
          : key === '.'
        if (!allowed) issues.push(`${location}: ${specifier} is not a public export`)
      }
      if (dependency !== owner.name && !owner.dependencies?.[dependency] && !owner.devDependencies?.[dependency]) {
        issues.push(`${location}: direct dependency ${dependency} is missing from ${owner.name}'s manifest`)
      }
      if (owner.name === '@pm/geometry' && dependency === '@pm/materials' || owner.name === '@pm/materials' && dependency === '@pm/geometry') {
        issues.push(`${location}: geometry/material dependencies must remain independent`)
      }
      if (owner.name === '@pm/equivalent-block' && dependency.startsWith('@pm/code-')) {
        issues.push(`${location}: the standard-neutral block kernel cannot select a code adapter`)
      }
      if (owner.name.startsWith('@pm/') && !['@pm/web', '@pm/report'].includes(owner.name) &&
        /^(?:@pm\/report|@pm\/spreadsheet|@structures\/cad-drawing|react|react-dom|next|plotly|plotly\.js|plotly\.js-dist-min|exceljs)$/u.test(dependency) &&
        !(owner.name === '@pm/spreadsheet' && dependency === 'exceljs')) {
        issues.push(`${location}: canonical packages cannot import presentation adapters`)
      }
    }
    const visit = (node: ts.Node) => {
      let literal: ts.Node | undefined
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) literal = node.moduleSpecifier
      else if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || ts.isIdentifier(node.expression) && node.expression.text === 'require')) literal = node.arguments[0]
      else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) literal = node.argument.literal
      if (literal && ts.isStringLiteral(literal)) inspect(literal.text, literal.getStart(source))
      ts.forEachChild(node, visit)
    }
    visit(source)
  }
  const state = new Map<string, number>(), trail: string[] = []
  const visit = (name: string) => {
    if (state.get(name) === 2) return
    if (state.get(name) === 1) {
      issues.push(`Workspace dependency cycle: ${[...trail.slice(trail.indexOf(name)), name].join(' -> ')}`)
      return
    }
    state.set(name, 1); trail.push(name)
    for (const next of graph.get(name) ?? []) visit(next)
    trail.pop(); state.set(name, 2)
  }
  for (const name of graph.keys()) visit(name)
  return [...new Set(issues)]
}
