/** REBAR-AS-001..003: canonical mm/mm². Fill actions are never reactive constraints. */
export type RebarAreaSource =
  | { type: 'manual' }
  | { type: 'equation'; dia: number; area: number }
  | { type: 'catalog'; dia: number; area: number; catalogId: string; designation: string; label: string; sourceUrl: string }

export type RebarSectionProperties = { dia: number; area?: number; areaSource?: RebarAreaSource }
export type LegacyRebarMechanics = 'stress-strain' | 'equivalent-block'

export const circularRebarArea = (dia: number): number => {
  const area = (Math.PI * dia * dia) / 4
  if (!Number.isFinite(dia) || dia <= 0 || !Number.isFinite(area) || area <= 0) {
    throw new Error('Rebar diameter must produce a finite positive area.')
  }
  return area
}

/** The only diameter-only compatibility boundary; explicit area always wins, including invalid input. */
export const rebarArea = (bar: RebarSectionProperties, legacy: LegacyRebarMechanics = 'stress-strain'): number => {
  const area = bar.area === undefined
    ? legacy === 'equivalent-block' ? Math.PI * bar.dia ** 2 / 4 : circularRebarArea(bar.dia)
    : bar.area
  if (!Number.isFinite(area) || area <= 0) throw new Error('Rebar area must be finite and greater than zero.')
  return area
}

export const equationRebarProperties = (dia: number): Required<RebarSectionProperties> => {
  const area = circularRebarArea(dia)
  return { dia, area, areaSource: { type: 'equation', dia, area } }
}

/** A stale source claim is discarded; provenance can never restore or override edited numbers. */
export const rebarAreaSource = (bar: RebarSectionProperties): RebarAreaSource => {
  const source = bar.areaSource
  if (!source || source.type === 'manual' || source.dia !== bar.dia || source.area !== bar.area) return { type: 'manual' }
  return { ...source }
}

/** Materialize a diameter-only boundary once; no later editor action derives area implicitly. */
export const withStoredRebarArea = <T extends RebarSectionProperties>(bar: T,
  legacy: LegacyRebarMechanics = 'stress-strain'): T & { area: number; areaSource: RebarAreaSource } => {
  const area = rebarArea(bar, legacy)
  return { ...bar, area, areaSource: bar.area === undefined
    ? { type: 'equation', dia: bar.dia, area } : rebarAreaSource(bar) }
}

export const rebarAreaSourceLabel = (bar: RebarSectionProperties): string => {
  if (bar.area === undefined) return 'Legacy equation'
  const source = rebarAreaSource(bar)
  return source.type === 'catalog' ? `${source.label} — ${source.designation}`
    : source.type === 'equation' ? 'Equation (one-time fill)' : 'Manual'
}

export const parseRebarAreaSource = (value: unknown): RebarAreaSource => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('Invalid rebar area source.')
  const source = value as Record<string, unknown>
  if (source.type === 'manual') return { type: 'manual' }
  if ((source.type !== 'equation' && source.type !== 'catalog') ||
      typeof source.dia !== 'number' || !Number.isFinite(source.dia) || source.dia <= 0 ||
      typeof source.area !== 'number' || !Number.isFinite(source.area) || source.area <= 0) {
    throw new Error('Invalid rebar area source snapshot.')
  }
  if (source.type === 'equation') return { type: 'equation', dia: source.dia, area: source.area }
  const text = (key: string, limit: number): string => {
    const item = source[key]
    if (typeof item !== 'string' || !item.trim() || item.length > limit) throw new Error(`Invalid rebar source ${key}.`)
    return item
  }
  const sourceUrl = text('sourceUrl', 1024)
  if (!/^https:\/\/[^\s]+$/u.test(sourceUrl)) throw new Error('Rebar source URL must use HTTPS.')
  return { type: 'catalog', dia: source.dia, area: source.area, catalogId: text('catalogId', 160),
    designation: text('designation', 80), label: text('label', 240), sourceUrl }
}
