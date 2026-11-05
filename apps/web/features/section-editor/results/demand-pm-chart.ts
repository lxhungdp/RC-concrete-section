import { resultantMomentCoordinate, type buildDemandPmGeometry, type DemandPmPoint, type Resultant } from '@pm/analysis'

type Geometry = ReturnType<typeof buildDemandPmGeometry>
type Style = {
  primary: string; guide: string; markerOutline: string
  showDesign: boolean; showNominal: boolean; showTheta: boolean; constantP: boolean
  displayForce: (value: number) => number; displayMoment: (value: number) => number
  forceUnit: string; momentUnit: string
  criterion?: (point: DemandPmPoint, stage: 'nominal' | 'design', theta: boolean) => string
}

/** Match the load point's ten-pixel marker and one-pixel outline. */
const demandIntersectionMarker = (color: string, curve: 'solid' | 'dotted', outline: string) => {
  return { size: 10, color, symbol: curve === 'dotted' ? 'circle-open' : 'circle',
    line: { color: curve === 'dotted' ? color : outline, width: 1 } }
}

export const demandPmSummaryMessage = (reason: Extract<Geometry['summary'], { status: 'unavailable' }>['reason']) => ({
  'missing-curve': 'Direct β curve unavailable.',
  'missing-demand': 'Select a loadcase.',
  'zero-path': 'Zero 2D load path.',
  'invalid-arithmetic': 'Invalid 2D coordinates.',
  'no-intersection': 'No forward 2D intersection.',
  'multiple-intersections': 'Multiple 2D intersections.',
  'overlap': 'Overlapping 2D paths.',
  'contact': 'No positive transverse crossing.',
  'ambiguous-components': 'Ambiguous 2D moment components.'
})[reason]

/** Presentation copies only. Geometry and diagnostics come from the analysis owner. */
export const demandPmTraces = (geometry: Geometry, style: Style, beforeCapField: Resultant | null) => {
  const { displayForce: force, displayMoment: moment } = style
  const coordinate = `M=%{x:.3f} ${style.momentUnit}<br>P=%{y:.3f} ${style.forceUnit}`
  const actionHover = `${coordinate}<br>Mx=%{customdata[0]:.3f}<br>My=%{customdata[1]:.3f}<br>θmoment=%{customdata[2]}°<br>Point role=%{customdata[5]}`
  const custom = (point: DemandPmPoint) => [moment(point.Mx), moment(point.My),
    point.theta === null ? null : point.theta * 180 / Math.PI,
    point.beta === null ? null : point.beta * 180 / Math.PI,
    point.stationId, point.role, point.sourceId, moment(resultantMomentCoordinate(point).M)]
  const customFields = ['Mx', 'My', 'moment direction (deg)', 'strain beta (deg)', 'station ID', 'point role', 'source ID', 'M_R', 'Criteria']
  const line = (paths: DemandPmPoint[][], name: string, color: string, dash: string, family: string, definition: string, resistanceStage: 'nominal' | 'design') =>
    paths.map((path, index) => ({
      type: 'scatter', name: `${name}${index ? ` · path ${index + 1}` : ''}`, mode: 'lines',
      x: path.map(point => moment(point.M)), y: path.map(point => force(point.P)),
      line: { color, width: 2, dash, shape: 'linear', simplify: false }, connectgaps: false,
      customdata: path.map(point => [...custom(point), style.criterion?.(point, resistanceStage, family.startsWith('theta')) ?? '—']),
      meta: { family, momentCoordinate: definition, resistanceStage,
        resultantColumns: { Mx: 0, My: 1, MR: 7, P: 'y', Criteria: 8 },
        dataLabel: [family.startsWith('theta') ? 'θ cut' : '', family.endsWith('before-cap') ? 'before Pmax (excluded)' : ''].filter(Boolean).join(' · '),
        selectedBetaDeg: geometry.beta * 180 / Math.PI, loadPlaneThetaDeg: geometry.theta * 180 / Math.PI,
        customDataFields: customFields, coordinateRows: path.length,
        physicalStations: new Set(path.filter(point => point.role === 'physical-station').map(point => point.sourceId)).size },
      hovertemplate: `${actionHover}<extra>${name}</extra>`
    }))
  const nominalColor = style.showDesign ? style.guide : style.primary
  const selected = (style.showDesign ? geometry.design : geometry.nominal).flat()
  const stations = selected.filter(point => point.role === 'physical-station')
  const cap = selected.filter(point => point.role === 'cap-edge')
  return [
    ...(geometry.loadPath.length ? [{
      type: 'scatter', name: `${style.constantP ? 'Constant-P' : 'Proportional'} load path`, mode: 'lines',
      x: geometry.loadPath.map(point => moment(point.M)), y: geometry.loadPath.map(point => force(point.P)),
      line: { color: '#ff1f3d', width: 1.8 }, hoverinfo: 'skip'
    }] : []),
    ...(style.showNominal ? line(geometry.nominal, 'Direct β · Nominal', nominalColor,
      style.showDesign ? 'dash' : 'solid', 'direct-beta-nominal', 'M_R = hypot(Mx, My)', 'nominal') : []),
    ...(style.showDesign ? line(geometry.design, 'Direct β · Design', style.primary,
      'solid', 'direct-beta-design', 'M_R = hypot(Mx, My)', 'design') : []),
    ...(style.showTheta && style.showNominal ? line(geometry.nominalTheta, 'Load-angle θ · Nominal', '#ef4444',
      'dot', 'theta-nominal', 'Forward M_theta = Mx cos(theta) + My sin(theta), M_theta >= 0', 'nominal') : []),
    ...(style.showTheta && style.showDesign ? line(geometry.designTheta, 'Load-angle θ · Design', '#ef4444',
      'dot', 'theta-design', 'Forward M_theta = Mx cos(theta) + My sin(theta), M_theta >= 0', 'design') : []),
    ...(style.showDesign ? line(geometry.beforeDirect, 'Direct β · Design before Pmax cap', style.primary,
      'dot', 'direct-beta-before-cap', 'M_R = hypot(Mx, My); excluded from Design checks', 'design') : []),
    ...(style.showDesign && style.showTheta ? line(geometry.beforeTheta, 'Load-angle θ · Design before Pmax cap', '#ef4444',
      'dot', 'theta-before-cap', 'Forward M_theta >= 0; excluded from Design checks', 'design') : []),
    ...(stations.length ? [{
      type: 'scatter', name: 'Direct β physical stations', mode: 'markers',
      x: stations.map(point => moment(point.M)), y: stations.map(point => force(point.P)),
      customdata: stations.map(custom), text: stations.map(point => point.stationId),
      meta: { customDataFields: customFields },
      marker: { size: 6, color: '#ef4444', line: { color: style.markerOutline, width: 0.8 } },
      hovertemplate: `%{text}<br>${actionHover}<extra>Physical station</extra>`
    }] : []),
    ...(cap.length ? [{
      type: 'scatter', name: 'Direct β Pmax edge intersections', mode: 'markers',
      x: cap.map(point => moment(point.M)), y: cap.map(point => force(point.P)), customdata: cap.map(custom),
      meta: { customDataFields: customFields },
      marker: { size: 6, color: style.primary }, hovertemplate: `${actionHover}<extra>Geometric Pmax intersection</extra>`
    }] : []),
    ...(geometry.basis !== 'direct2D' && style.showDesign && geometry.diagnostic.points.length ? [{
      type: 'scatter', name: 'Direct β 2D intersections', mode: 'markers',
      x: geometry.diagnostic.points.map(point => moment(point.M)), y: geometry.diagnostic.points.map(point => force(point.P)),
      customdata: geometry.diagnostic.points.map(point => [point.lambda, point.kind, point.sources]),
      meta: { family: 'direct-beta-2d-diagnostic', sourceIndices: 'Zero-based Direct-beta Design path and segment indices',
        customDataFields: ['2D multiplier', 'contact kind', 'source paths/segments/fractions'] },
      marker: demandIntersectionMarker(style.primary, 'solid', style.markerOutline),
      hovertemplate: `${coordinate}<br>λ2D=%{customdata[0]:.6f}<br>%{customdata[1]}<extra>Direct β 2D diagnostic</extra>`
    }] : []),
    ...(geometry.demand ? [{
      type: 'scatter', name: 'Demand point', mode: 'markers',
      x: [moment(geometry.demand.M)], y: [force(geometry.demand.P)],
      marker: { size: 10, color: '#ff1f3d', line: { color: style.markerOutline, width: 1 } },
      hovertemplate: `${coordinate}<extra>Checked centroidal demand</extra>`
    }] : []),
    ...((geometry.basis === 'direct2D' || style.showTheta) && style.showDesign && geometry.governing ? [{
      type: 'scatter', name: geometry.basis === 'direct2D' ? 'Governing Design crossing · 2D Load Ray' : 'Governing Design crossing · θ', mode: 'markers',
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
