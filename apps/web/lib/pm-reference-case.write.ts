/**
 * Writes the reference project JSON next to the workbook it was transcribed from, then re-parses it
 * through `parseProjectDocument` so a file that cannot be imported is never produced.
 *
 * Run: npm run fixture:reference-json
 */
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseProjectDocument, serializeProjectDocument } from '@pm/project'
import { referenceProjectDocument } from './pm-reference-case'

const target = resolve(process.cwd(), 'docs/example case/PM-advanced (7) 2D.pm-project.json')
const document = referenceProjectDocument()
// Pin the stamp so regenerating an unchanged fixture produces a byte-identical file.
document.meta.updatedAt = document.meta.createdAt
const raw = serializeProjectDocument(document)

const parsed = parseProjectDocument(raw)
if (!parsed.ok) {
  console.error(`Refusing to write: generated JSON does not parse.\n${parsed.error}`)
  process.exit(1)
}
if (parsed.warnings.length > 0) {
  console.error(`Refusing to write: parser reported warnings.\n${parsed.warnings.join('\n')}`)
  process.exit(1)
}

writeFileSync(target, `${raw}\n`, 'utf8')

const geometry = parsed.document.inputs.geometry
const outer = geometry.outers[0]
console.log(`wrote ${target}`)
console.log(
  `  solids=${geometry.outers.length}  outer points=${outer.points.length}  ` +
    `holes=${outer.holes.length} (${outer.holes.map((hole) => hole.points.length).join(', ')} points)  ` +
    `rebars=${outer.rebars.length}  steel materials=${parsed.document.inputs.materials.steel.length}  ` +
    `load combinations=${parsed.document.inputs.loadings.combinations.length}`
)
