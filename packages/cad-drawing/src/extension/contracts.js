const normalizeRegistryList = (items) => Array.isArray(items) ? items.filter(Boolean) : []
const { createAttachmentLayer, createEntityLayer } = require('./entities')
const { createResultLayer } = require('./results')

/**
 * Build a drawing plugin descriptor.
 *
 * A plugin contributes project-specific behavior without owning the CAD shell.
 * Frame, shell, and plate projects should put their model renderers, tools,
 * result layers, menus, and selection panels here.
 */
const createDrawingPlugin = (plugin) => ({
  id: plugin && plugin.id ? plugin.id : 'anonymous',
  label: plugin && plugin.label ? plugin.label : 'Drawing Plugin',
  entityLayers: normalizeRegistryList(plugin && plugin.entityLayers).map(createEntityLayer),
  attachmentLayers: normalizeRegistryList(plugin && plugin.attachmentLayers).map(createAttachmentLayer),
  tools: normalizeRegistryList(plugin && plugin.tools),
  overlayLayers: normalizeRegistryList(plugin && plugin.overlayLayers),
  resultLayers: normalizeRegistryList(plugin && plugin.resultLayers).map(createResultLayer),
  toolbarMenus: normalizeRegistryList(plugin && plugin.toolbarMenus),
  selectionPanels: normalizeRegistryList(plugin && plugin.selectionPanels)
})

const flattenDrawingPlugins = (plugins) => normalizeRegistryList(plugins).reduce((acc, plugin) => {
  const p = createDrawingPlugin(plugin)
  acc.entityLayers.push(...p.entityLayers)
  acc.attachmentLayers.push(...p.attachmentLayers)
  acc.tools.push(...p.tools)
  acc.overlayLayers.push(...p.overlayLayers)
  acc.resultLayers.push(...p.resultLayers)
  acc.toolbarMenus.push(...p.toolbarMenus)
  acc.selectionPanels.push(...p.selectionPanels)
  return acc
}, {
  entityLayers: [],
  attachmentLayers: [],
  tools: [],
  overlayLayers: [],
  resultLayers: [],
  toolbarMenus: [],
  selectionPanels: []
})

module.exports = {
  createDrawingPlugin,
  flattenDrawingPlugins
}
