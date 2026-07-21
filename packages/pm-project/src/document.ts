import { createEmptyGeometryInput, type GeometryInput } from '@pm/geometry'
import { createDefaultMaterialStore, type MaterialStore } from '@pm/materials'
import { nextAvailableId } from './ids'
import { cloneLoadingsInput, createEmptyLoadingsInput } from './loadings'
import {
  PM_PROJECT_SCHEMA,
  PM_PROJECT_VERSION,
  type ParseProjectResult,
  type PmProjectDocument,
  type ProjectInputSnapshot
} from './types'
import { collectProjectWarnings, parseProjectDocumentValue } from './validate'

const nowIso = () => new Date().toISOString()

export const makeProjectId = (used: Iterable<number> = []) => nextAvailableId(used)

const clonePoint = <T extends { id: number; x: number; y: number }>(point: T): T => ({ ...point })

const cloneGeometryInput = (input: GeometryInput): GeometryInput => ({
  id: input.id,
  name: input.name,
  outers: input.outers.map((outer) => ({
    id: outer.id,
    points: outer.points.map(clonePoint),
    holes: outer.holes.map((hole) => ({
      id: hole.id,
      points: hole.points.map(clonePoint)
    })),
    rebars: outer.rebars.map((rebar) => ({ ...rebar }))
  }))
})

const cloneMaterialStore = (store: MaterialStore): MaterialStore =>
  JSON.parse(JSON.stringify(store)) as MaterialStore

const sanitizeFileStem = (name: string) =>
  name
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'pm-project'

/**
 * Build a project document from current engineering inputs.
 * Pass existing meta.id / createdAt when updating an open project.
 */
export const createProjectDocument = (snapshot: ProjectInputSnapshot): PmProjectDocument => {
  const stamp = nowIso()
  const geometry = cloneGeometryInput(snapshot.geometry)
  const materials = cloneMaterialStore(snapshot.materials)
  const loadings = cloneLoadingsInput(snapshot.loadings ?? createEmptyLoadingsInput())

  return {
    schema: PM_PROJECT_SCHEMA,
    version: PM_PROJECT_VERSION,
    meta: {
      id: snapshot.meta?.id ?? makeProjectId([]),
      name: snapshot.meta?.name ?? geometry.name ?? 'Column project',
      createdAt: snapshot.meta?.createdAt ?? stamp,
      updatedAt: stamp
    },
    inputs: {
      geometry,
      materials,
      loadings
    }
  }
}

export const createEmptyProjectDocument = (
  patch: Partial<Pick<PmProjectDocument['meta'], 'id' | 'name'>> = {}
): PmProjectDocument =>
  createProjectDocument({
    geometry: createEmptyGeometryInput({ id: 1, name: patch.name ?? 'Column section' }),
    materials: createDefaultMaterialStore(),
    loadings: createEmptyLoadingsInput(),
    meta: {
      id: patch.id ?? 1,
      name: patch.name ?? 'Column project'
    }
  })

export const serializeProjectDocument = (document: PmProjectDocument, pretty = true): string =>
  JSON.stringify(document, null, pretty ? 2 : undefined)

export const projectDocumentFileName = (document: PmProjectDocument): string =>
  `${sanitizeFileStem(document.meta.name)}.json`

export const parseProjectDocument = (raw: string | unknown): ParseProjectResult => {
  try {
    const value = typeof raw === 'string' ? (JSON.parse(raw) as unknown) : raw
    const document = parseProjectDocumentValue(value)
    const warnings = collectProjectWarnings(document)

    if (!document.inputs.materials.steel.some((item) => item.id === document.inputs.materials.defaults.steelMaterialId)) {
      document.inputs.materials.defaults.steelMaterialId = document.inputs.materials.steel[0]?.id ?? 1
    }

    return { ok: true, document, warnings }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Invalid project JSON'
    }
  }
}
