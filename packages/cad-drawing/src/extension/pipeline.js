const { createAttachmentLayer, createEntityLayer } = require('./entities')
const { createResultLayer } = require('./results')

const normalizeList = (items) => Array.isArray(items) ? items.filter(Boolean) : []

/**
 * Build a normalized drawing pipeline from plugin registrations.
 *
 * Render order is intentionally explicit:
 * 1. entity layers: ids/topology-bearing model objects
 * 2. attachment layers: loads/restraints/releases/rigids attached to entities
 * 3. overlay layers: helper graphics, previews, labels, view adornments
 * 4. result layers: displacement/force/moment/stress/strain/reaction output
 */
const createDrawingPipeline = (plugins) => {
  const pipeline = {
    entityLayers: [],
    attachmentLayers: [],
    overlayLayers: [],
    resultLayers: [],
    tools: [],
    toolbarMenus: [],
    selectionPanels: []
  }

  normalizeList(plugins).forEach((plugin) => {
    normalizeList(plugin.entityLayers).forEach((layer) => pipeline.entityLayers.push(createEntityLayer(layer)))
    normalizeList(plugin.attachmentLayers).forEach((layer) => pipeline.attachmentLayers.push(createAttachmentLayer(layer)))
    normalizeList(plugin.overlayLayers).forEach((layer) => pipeline.overlayLayers.push(layer))
    normalizeList(plugin.resultLayers).forEach((layer) => pipeline.resultLayers.push(createResultLayer(layer)))
    normalizeList(plugin.tools).forEach((tool) => pipeline.tools.push(tool))
    normalizeList(plugin.toolbarMenus).forEach((menu) => pipeline.toolbarMenus.push(menu))
    normalizeList(plugin.selectionPanels).forEach((panel) => pipeline.selectionPanels.push(panel))
  })

  return pipeline
}

module.exports = { createDrawingPipeline }
