const lightCadTheme = {
  canvas: {
    background: [1, 1, 1, 1],
    gridMinor: [1, 1, 1, 0.1],
    gridMajor: [0.68, 0.72, 0.78, 0.5]
  },
  entity: {
    node: 'rgba(220,50,47,0.95)',
    member: 'rgba(25, 118, 210, 0.92)',
    selected: 'rgba(255, 193, 7, 0.98)'
  },
  overlay: {
    origin: 'rgba(107, 114, 128, 0.9)',
    load: 'rgba(220, 38, 38, 0.9)',
    restraint: 'rgba(55, 65, 81, 0.9)',
    release: 'rgba(107, 114, 128, 0.9)',
    result: 'rgba(37, 99, 235, 0.95)'
  },
  toolbar: {
    surface: 'rgba(248, 250, 252, 0.94)',
    activeFill: 'rgba(14, 165, 233, 0.22)',
    activeBorder: 'rgba(2, 132, 199, 0.55)',
    icon: '#1f2937'
  }
}

const mergeCadTheme = (base, patch) => {
  const out = Object.assign({}, base)
  Object.keys(patch || {}).forEach((key) => {
    const value = patch[key]
    out[key] = value && typeof value === 'object' && !Array.isArray(value)
      ? Object.assign({}, out[key] || {}, value)
      : value
  })
  return out
}

module.exports = { lightCadTheme, mergeCadTheme }
