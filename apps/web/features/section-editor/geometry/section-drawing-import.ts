import { createDefaultMaterialStore, materialStoreIssues, type ConcreteMaterial, type MaterialStore, type SteelMaterial } from '@pm/materials'
import { applyCalculationProfileToMaterials, type CalculationProfileId } from '@pm/project'
import { type DrawingResult, type SectionDrawing } from './section-dxf'

type DrawingMaterials = { concrete?: ConcreteMaterial; steel: SteelMaterial[]; defaults?: MaterialStore['defaults'] }
export type PreparedDrawingImport = { drawing: SectionDrawing; materials: MaterialStore }

/** Explicit drawing-import policy: first existing material; create only absent families. */
export const prepareDrawingImport = (
  drawing: SectionDrawing,
  source: DrawingMaterials | undefined,
  profileId: CalculationProfileId
): DrawingResult<PreparedDrawingImport> => {
  const warnings: string[] = []
  const missingConcrete = source?.concrete === undefined
  const missingSteel = !source?.steel.length
  const defaults = missingConcrete || missingSteel
    ? applyCalculationProfileToMaterials(createDefaultMaterialStore(), profileId)
    : undefined
  const concrete = source?.concrete ?? defaults?.concrete
  const steel = source?.steel.length ? source.steel : defaults?.steel
  if (!concrete || !steel?.length) return { ok: false, issue: { code: 'INVALID_MATERIALS', message: 'Drawing import requires concrete and steel definitions.' } }
  if (missingConcrete) warnings.push(`Created default concrete "${concrete.name}" for the current calculation profile.`)
  if (missingSteel) warnings.push(`Created default steel "${steel[0].name}" for the current calculation profile.`)
  const materials: MaterialStore = {
    strainSign: 'compression-positive', concrete, steel,
    defaults: source?.defaults && !missingSteel ? source.defaults : { steelMaterialId: steel[0].id }
  }
  const issues = materialStoreIssues(materials)
  if (issues.length) return { ok: false, issue: { code: 'INVALID_MATERIALS', message: issues.map(issue => `${issue.path} ${issue.message}`).join('; ') } }
  if (drawing.rebars.length) warnings.push(`Imported rebars use the first steel material: "${steel[0].name}".`)
  return {
    ok: true, warnings,
    value: { materials, drawing: { outers: drawing.outers, rebars: drawing.rebars.map(bar => ({ ...bar, steelMaterialId: steel[0].id })) } }
  }
}
