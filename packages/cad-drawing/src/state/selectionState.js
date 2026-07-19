const { entityKey, normalizeEntityRef } = require('../extension/entities')

const defaultSelectionState = () => ({
  selectedNodeIds: [],
  selectedElementIds: [],
  selectedEntities: []
})

const legacyEntitiesFromSelection = (selection) => {
  const out = []
  ;(selection.selectedNodeIds || []).forEach((id) => out.push({ kind: 'node', id }))
  ;(selection.selectedElementIds || []).forEach((id) => out.push({ kind: 'element', id }))
  return out
}

const normalizeSelectionState = (selection) => {
  const s = Object.assign(defaultSelectionState(), selection || {})
  const map = new Map()
  legacyEntitiesFromSelection(s).forEach((ref) => map.set(entityKey(ref), normalizeEntityRef(ref)))
  ;(s.selectedEntities || []).forEach((ref) => {
    const n = normalizeEntityRef(ref)
    if (n) map.set(entityKey(n), n)
  })
  const selectedEntities = Array.from(map.values())
  return Object.assign({}, s, {
    selectedEntities,
    selectedNodeIds: selectedEntities.filter((x) => x.kind === 'node').map((x) => x.id),
    selectedElementIds: selectedEntities.filter((x) => x.kind === 'element').map((x) => x.id)
  })
}

const setSelectedEntities = (state, entities, options = {}) => {
  if (!state || !state.viewer) return {}
  const prev = normalizeSelectionState(state.viewer.selection)
  const nextInput = options.addToSelection
    ? prev.selectedEntities.concat(entities || [])
    : entities || []
  const selection = normalizeSelectionState({ selectedEntities: nextInput })
  const viewer = Object.assign({}, state.viewer, { selection })
  return { viewer }
}

module.exports = {
  defaultSelectionState,
  normalizeSelectionState,
  setSelectedEntities
}
