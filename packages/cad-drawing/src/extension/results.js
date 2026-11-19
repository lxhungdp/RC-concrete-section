const RESULT_FAMILIES = ['displacement', 'force', 'moment', 'stress', 'strain', 'reaction', 'custom']

const createResultLayer = (layer) => ({
  id: layer && layer.id ? layer.id : 'result',
  label: layer && layer.label ? layer.label : 'Result',
  family: RESULT_FAMILIES.includes(layer && layer.family) ? layer.family : 'custom',
  entityKinds: Array.isArray(layer && layer.entityKinds) ? layer.entityKinds : [],
  components: Array.isArray(layer && layer.components) ? layer.components : [],
  getValues: typeof (layer && layer.getValues) === 'function' ? layer.getValues : null,
  render: typeof (layer && layer.render) === 'function' ? layer.render : () => undefined,
  table: layer && layer.table ? layer.table : null,
  legend: layer && layer.legend ? layer.legend : null
})

module.exports = {
  RESULT_FAMILIES,
  createResultLayer
}
