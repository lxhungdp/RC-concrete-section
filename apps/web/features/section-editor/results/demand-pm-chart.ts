import { resultantMomentCoordinate, type buildDemandPmGeometry, type DemandPmPoint, type Resultant } from '@pm/analysis'

type Geometry = ReturnType<typeof buildDemandPmGeometry>
type Style = {
  primary: string; guide: string; markerOutline: string
  showDesign: boolean; showNominal: boolean; constantP: boolean
  displayForce: (value: number) => number; displayMoment: (value: number) => number
  forceUnit: string; momentUnit: string
  criterion?: (point: DemandPmPoint, stage: 'nominal' | 'design') => string
}

/** Match the load point's ten-pixel marker and one-pixel outline. */
const demandIntersectionMarker = (color: string, curve: 'solid' | 'dotted', outline: string) => {
  return { size: 10, color, symbol: curve === 'dotted' ? 'circle-open' : 'circle',
    line: { color: curve === 'dotted' ? color : outline, width: 1 } }
}

export const demandPmSummaryMessage = (reason: Extract<Geometry['summary'], { status: 'unavailable' }>['reason']) => ({
  'missing-curve': 'Load-direction curve unavailable.',
  'missing-demand': 'Select a loadcase.',
  'zero-path': 'Zero load path.',
  'invalid-arithmetic': 'Invalid curve coordinates.',
  'no-intersection': 'No forward curve crossing.',
  'multiple-intersections': 'Multiple curve crossings.',
  'overlap': 'Overlapping paths.',
  'contact': 'No positive transverse crossing.',
  'ambiguous-components': 'Ambiguous moment components.'
})[reason]

/** Presentation copies only. Geometry and diagnostics come from the analysis owner. */
export const demandPmTraces = (geometry: Geometry, style: Style, beforeCapField: Resultant | null) => {
  const { displayForce: force, displayMoment: moment } = style
  const coordinate = `M=%{x:.3f} ${style.momentUnit}<br>P=%{y:.3f} ${style.forceUnit}`
  const actionHover = `${coordinate}<br>Mx=%{customdata[0]:.3f}<br>My=%{customdata[1]:.3f}<br>β=%{customdata[3]:.3f}°<br>Point role=%{customdata[5]}`
  const custom = (point: DemandPmPoint) => [moment(point.Mx), moment(point.My),
    point.theta === null ? null : point.theta * 180 / Math.PI,
    point.beta === null ? null : point.beta * 180 / Math.PI,
    point.stationId, point.role, point.sourceId, moment(resultantMomentCoordinate(point).M)]
  const customFields = ['Mx', 'My', 'moment direction (deg)', 'strain beta of this point (deg)', 'station ID', 'point role', 'source ID', 'M_R', 'Criteria']
  const line = (paths: DemandPmPoint[][], name: string, color: string, dash: string, family: string, definition: string, resistanceStage: 'nominal' | 'design') =>
    paths.map((path, index) => ({
      type: 'scatter', name: `${name}${index ? ` · path ${index + 1}` : ''}`, mode: 'lines',
      x: path.map(point => moment(point.M)), y: path.map(point => force(point.P)),
      line: { color, width: 2, dash, shape: 'linear', simplify: false }, connectgaps: false,
      customdata: path.map(point => [...custom(point), style.criterion?.(point, resistanceStage) ?? '—']),
      meta: { family, momentCoordinate: definition, resistanceStage,
        resultantColumns: { Mx: 0, My: 1, MR: 7, P: 'y', Criteria: 8, Beta: 3 },
        dataLabel: family.endsWith('before-cap') ? 'before Pmax (excluded)' : '',
        loadPlaneThetaDeg: geometry.theta === null ? null : geometry.theta * 180 / Math.PI,
        customDataFields: customFields, coordinateRows: path.length,
        physicalStations: path.filter(point => point.role === 'physical-station' && point.beta !== null).length },
      hovertemplate: `${actionHover}<extra>${name}</extra>`
    }))
  const nominalColor = style.showDesign ? style.guide : style.primary
  const selected = (style.showDesign ? geometry.design : geometry.nominal).flat()
  const stations = selected.filter(point => point.role === 'physical-station')
  const between = selected.filter(point => point.role === 'between-stations')
  const geometricCut = selected.filter(point => point.role === 'interpolated')
  const cap = selected.filter(point => point.role === 'cap-edge')
  return [
    ...(geometry.loadPath.length ? [{
      type: 'scatter', name: `${style.constantP ? 'Constant-P' : 'Proportional'} load path`, mode: 'lines',
      x: geometry.loadPath.map(point => moment(point.M)), y: geometry.loadPath.map(point => force(point.P)),
      line: { color: '#ff1f3d', width: 1.8 }, hoverinfo: 'skip'
    }] : []),
    ...(style.showNominal ? line(geometry.nominal, 'Load direction θ · Nominal', nominalColor,
      style.showDesign ? 'dash' : 'solid', 'load-direction-nominal', 'M_theta = Mx cos(theta) + My sin(theta)', 'nominal') : []),
    ...(style.showDesign ? line(geometry.design, 'Load direction θ · Design', style.primary,
      'solid', 'load-direction-design', 'M_theta = Mx cos(theta) + My sin(theta)', 'design') : []),
    ...(style.showDesign ? line(geometry.beforeCap, 'Load direction θ · Design before Pmax cap', style.primary,
      'dashdot', 'load-direction-before-cap', 'M_theta; excluded from Design checks', 'design') : []),
    ...(stations.length ? [{
      type: 'scatter', name: 'Physical stations (own β)', mode: 'markers',
      x: stations.map(point => moment(point.M)), y: stations.map(point => force(point.P)),
      customdata: stations.map(custom), text: stations.map(point => point.stationId),
      meta: { customDataFields: customFields },
      marker: { size: 6, color: '#ef4444', line: { color: style.markerOutline, width: 0.8 } },
      hovertemplate: `%{text}<br>${actionHover}<extra>Physical station</extra>`
    }] : []),
    ...(between.length ? [{
      type: 'scatter', name: 'States between stations (own β)', mode: 'markers',
      x: between.map(point => moment(point.M)), y: between.map(point => force(point.P)),
      customdata: between.map(custom), meta: { customDataFields: customFields },
      marker: { size: 4, color: '#ef4444', symbol: 'circle-open', line: { width: 1 } },
      hovertemplate: `${actionHover}<extra>Compatible state between stations</extra>`
    }] : []),
    ...(geometricCut.length ? [{
      type: 'scatter', name: 'Geometric cut points (no state)', mode: 'markers',
      x: geometricCut.map(point => moment(point.M)), y: geometricCut.map(point => force(point.P)),
      customdata: geometricCut.map(custom), meta: { customDataFields: customFields },
      marker: { size: 6, color: style.markerOutline, symbol: 'x-thin', line: { width: 1.2, color: '#a16207' } },
      hovertemplate: `${coordinate}<extra>Geometric cut point · not moved onto the physical surface</extra>`
    }] : []),
    ...(cap.length ? [{
      type: 'scatter', name: 'Pmax edge intersections', mode: 'markers',
      x: cap.map(point => moment(point.M)), y: cap.map(point => force(point.P)), customdata: cap.map(custom),
      meta: { customDataFields: customFields },
      marker: { size: 6, color: style.primary }, hovertemplate: `${actionHover}<extra>Geometric Pmax intersection</extra>`
    }] : []),
    ...(style.showDesign && geometry.diagnostic.points.length ? [{
      type: 'scatter', name: 'Curve crossing', mode: 'markers',
      x: geometry.diagnostic.points.map(point => moment(point.M)), y: geometry.diagnostic.points.map(point => force(point.P)),
      customdata: geometry.diagnostic.points.map(point => [point.lambda, point.kind, point.sources]),
      meta: { family: 'load-direction-crossing', sourceIndices: 'Zero-based load-direction Design path and segment indices',
        customDataFields: ['curve multiplier', 'contact kind', 'source paths/segments/fractions'] },
      marker: demandIntersectionMarker(style.primary, 'solid', style.markerOutline),
      hovertemplate: `${coordinate}<br>λcurve=%{customdata[0]:.6f}<br>%{customdata[1]}<extra>Load-direction curve crossing (diagnostic)</extra>`
    }] : []),
    ...(geometry.demand ? [{
      type: 'scatter', name: 'Demand point', mode: 'markers',
      x: [moment(geometry.demand.M)], y: [force(geometry.demand.P)],
      marker: { size: 10, color: '#ff1f3d', line: { color: style.markerOutline, width: 1 } },
      hovertemplate: `${coordinate}<extra>Checked centroidal demand</extra>`
    }] : []),
    ...(style.showDesign && geometry.governing ? [{
      type: 'scatter', name: 'Governing Design crossing', mode: 'markers',
      x: [moment(geometry.governing.M)], y: [force(geometry.governing.P)],
      marker: { size: 10, color: '#16a34a', symbol: 'diamond', line: { color: style.markerOutline, width: 1 } },
      hovertemplate: `${coordinate}<extra>Stored governing Design crossing</extra>`
    }] : []),
    ...(beforeCapField ? [{
      type: 'scatter', name: 'Field point before Pmax cap', mode: 'markers',
      x: [moment(resultantMomentCoordinate(beforeCapField).M)], y: [force(beforeCapField.P)],
      marker: demandIntersectionMarker(style.primary, 'dotted', style.markerOutline),
      hovertemplate: `${coordinate}<extra>Field before Pmax cap · exceeds permitted Design resistance</extra>`
    }] : [])
  ]
}
