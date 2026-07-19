const ENTITY_KINDS = ['node', 'element', 'plate', 'solid']
const ATTACHMENT_KINDS = ['load', 'restraint', 'release', 'rigid']

const isEntityKind = (kind) => ENTITY_KINDS.includes(kind)
const isAttachmentKind = (kind) => ATTACHMENT_KINDS.includes(kind)

/**
 * Normalize a selectable drawing entity reference.
 *
 * The CAD shell only requires `{ kind, id }`. Domain plugins may attach extra
 * metadata such as element topology, plate vertices, solid cell ids, or source
 * object references.
 */
const normalizeEntityRef = (ref) => {
  if (!ref || ref.id == null || !ref.kind) return null
  return {
    kind: String(ref.kind),
    id: ref.id,
    pluginId: ref.pluginId || null,
    data: ref.data || null
  }
}

const entityKey = (ref) => {
  const n = normalizeEntityRef(ref)
  return n ? `${n.kind}:${String(n.id)}` : ''
}

const createEntityLayer = (layer) => ({
  id: layer && layer.id ? layer.id : 'entities',
  label: layer && layer.label ? layer.label : 'Entities',
  entityKinds: Array.isArray(layer && layer.entityKinds) ? layer.entityKinds : [],
  getEntities: typeof (layer && layer.getEntities) === 'function' ? layer.getEntities : () => [],
  render: typeof (layer && layer.render) === 'function' ? layer.render : () => undefined,
  hitTest: typeof (layer && layer.hitTest) === 'function' ? layer.hitTest : null,
  getFitPoints: typeof (layer && layer.getFitPoints) === 'function' ? layer.getFitPoints : null
})

/**
 * Attachment layers represent domain objects attached to a base entity.
 *
 * Examples:
 * - loads attached to nodes/elements/plates
 * - restraints attached to nodes or edges
 * - releases attached to element ends
 * - rigid links attached between nodes/elements
 */
const createAttachmentLayer = (layer) => ({
  id: layer && layer.id ? layer.id : 'attachments',
  label: layer && layer.label ? layer.label : 'Attachments',
  attachmentKinds: Array.isArray(layer && layer.attachmentKinds) ? layer.attachmentKinds : [],
  targetEntityKinds: Array.isArray(layer && layer.targetEntityKinds) ? layer.targetEntityKinds : [],
  getAttachments: typeof (layer && layer.getAttachments) === 'function' ? layer.getAttachments : () => [],
  render: typeof (layer && layer.render) === 'function' ? layer.render : () => undefined,
  hitTest: typeof (layer && layer.hitTest) === 'function' ? layer.hitTest : null
})

module.exports = {
  ATTACHMENT_KINDS,
  ENTITY_KINDS,
  createAttachmentLayer,
  createEntityLayer,
  entityKey,
  isAttachmentKind,
  isEntityKind,
  normalizeEntityRef
}
