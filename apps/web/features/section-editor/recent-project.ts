import {
  parseProjectDocument,
  serializeProjectDocument,
  type CalculationProfileId
} from '@pm/project'

export const RECENT_PROJECT_STORAGE_KEY = 'pm-column-designer:recent-project:v1'
export const MAX_RECENT_PROJECTS = 5

export type RecentProject = {
  raw: string
  id: number
  name: string
  createdAt: string
  updatedAt: string
  calculationProfileId: CalculationProfileId
}

/** Accept only a valid current project document; older or corrupt local data is discarded. */
export const recentProjectFromRaw = (raw: unknown): RecentProject | null => {
  if (raw == null) return null
  const parsed = parseProjectDocument(raw)
  if (!parsed.ok) return null
  return {
    raw: serializeProjectDocument(parsed.document),
    id: parsed.document.meta.id,
    name: parsed.document.meta.name || parsed.document.inputs.geometry.name || 'Column project',
    createdAt: parsed.document.meta.createdAt,
    updatedAt: parsed.document.meta.updatedAt,
    calculationProfileId: parsed.document.inputs.calculationProfileId
  }
}

const recentProjectKey = (project: Pick<RecentProject, 'id' | 'createdAt'>) =>
  `${project.id}:${project.createdAt}`

export const upsertRecentProject = (
  projects: readonly RecentProject[],
  project: RecentProject
): RecentProject[] => [
  project,
  ...projects.filter((candidate) => recentProjectKey(candidate) !== recentProjectKey(project))
].slice(0, MAX_RECENT_PROJECTS)

export const recentProjectsFromStorage = (raw: unknown): RecentProject[] => {
  if (typeof raw !== 'string' || raw.length === 0) return []

  let value: unknown
  try {
    value = JSON.parse(raw) as unknown
  } catch {
    return []
  }

  // Accept the former single-project value once so an existing Recent entry survives this update.
  const candidates = Array.isArray(value) ? value : [value]
  const projects: RecentProject[] = []
  const seen = new Set<string>()
  for (const candidate of candidates) {
    const project = recentProjectFromRaw(candidate)
    if (!project) continue
    const key = recentProjectKey(project)
    if (seen.has(key)) continue
    seen.add(key)
    projects.push(project)
    if (projects.length === MAX_RECENT_PROJECTS) break
  }
  return projects
}

export const serializeRecentProjects = (projects: readonly RecentProject[]): string =>
  JSON.stringify(
    projects.slice(0, MAX_RECENT_PROJECTS).map((project) => JSON.parse(project.raw) as unknown)
  )
