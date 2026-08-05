'use client'

import { useRef, useState } from 'react'
import { FileInput, FileOutput, Plus, X } from 'lucide-react'
import {
  generateRebarsForSection,
  makeRebarId,
  REBAR_PATTERN_OPTIONS,
  type GeometryInputRebarView,
  type RebarGenerateParams,
  type RebarPatternKind,
  type SectionGeometry
} from '@pm/geometry'
import type { SteelMaterial } from '@pm/materials'

type Props = {
  hasAppliedSection: boolean
  appliedSection: SectionGeometry
  rebars: GeometryInputRebarView[]
  steelMaterials: SteelMaterial[]
  defaultSteelMaterialId: number
  selectedRebarId: number | null
  onSelectRebar: (id: number | null) => void
  onChangeRebars: (rebars: GeometryInputRebarView[]) => void
  onImportExcel: (file: File) => Promise<void>
  onExportExcel: () => Promise<void>
}

const DEFAULT_PARAMS: RebarGenerateParams = {
  cover: 40,
  dia: 20,
  count: 4,
  spacing: 100,
  solidIndex: 'all'
}

export function RebarPanel({
  hasAppliedSection,
  appliedSection,
  rebars,
  steelMaterials,
  defaultSteelMaterialId,
  selectedRebarId,
  onSelectRebar,
  onChangeRebars,
  onImportExcel,
  onExportExcel
}: Props) {
  const importInputRef = useRef<HTMLInputElement | null>(null)
  const [pattern, setPattern] = useState<RebarPatternKind>('top-bottom')
  const [params, setParams] = useState<RebarGenerateParams>(DEFAULT_PARAMS)
  const [replaceExisting, setReplaceExisting] = useState(true)

  const updateParam = <K extends keyof RebarGenerateParams>(key: K, value: RebarGenerateParams[K]) => {
    setParams((current) => ({ ...current, [key]: value }))
  }

  const runGenerate = () => {
    if (!hasAppliedSection) return
    const generated = generateRebarsForSection(appliedSection, pattern, {
      ...params,
      usedIds: replaceExisting ? [] : rebars.map((bar) => bar.id),
      solidIndex: appliedSection.solids.length > 1 ? params.solidIndex ?? 'all' : 0
    }).map((bar) => ({ ...bar, steelMaterialId: defaultSteelMaterialId, solidIndex: bar.solidIndex ?? 0 }))
    if (generated.length === 0) return
    const next = !replaceExisting ? [...rebars, ...generated] : generated
    onChangeRebars(next)
    onSelectRebar(generated[0]?.id ?? null)
  }

  const updateRebar = (id: number, patch: Partial<GeometryInputRebarView>) => {
    onChangeRebars(rebars.map((bar) => (bar.id === id ? { ...bar, ...patch } : bar)))
  }

  const addManualRebar = () => {
    if (!hasAppliedSection) return
    const outer = appliedSection.solids[0]?.outer ?? []
    const xs = outer.map((p) => p.x)
    const ys = outer.map((p) => p.y)
    const targetSolidIndex = typeof params.solidIndex === 'number' ? params.solidIndex : 0
    const bar: GeometryInputRebarView = {
      id: makeRebarId(rebars.map((item) => item.id)),
      x: xs.length ? Math.round((Math.min(...xs) + Math.max(...xs)) / 2) : 0,
      y: ys.length ? Math.round((Math.min(...ys) + Math.max(...ys)) / 2) : 0,
      dia: params.dia || 20,
      steelMaterialId: defaultSteelMaterialId,
      solidIndex: targetSolidIndex
    }
    onChangeRebars([...rebars, bar])
    onSelectRebar(bar.id)
  }

  const deleteRebar = (id: number) => {
    const next = rebars.filter((bar) => bar.id !== id)
    onChangeRebars(next)
    if (selectedRebarId === id) onSelectRebar(next[0]?.id ?? null)
  }

  const removeAllRebars = () => {
    if (rebars.length === 0) return
    onChangeRebars([])
    onSelectRebar(null)
  }

  if (!hasAppliedSection) {
    return (
      <section className="pm-panel-section">
        <div className="pm-section-title">
          <h2>Rebar</h2>
        </div>
        <p className="pm-preview-hint">Apply a concrete section first, then generate reinforcement for that section.</p>
      </section>
    )
  }

  const showSpacing = pattern === 'perimeter-spacing'

  return (
    <>
      <section className="pm-panel-section">
        <div className="pm-rebar-quick">
          <div className="pm-section-title">
            <h2>Quick Generate</h2>
          </div>
          <div className="pm-rebar-patterns" role="group" aria-label="Rebar patterns">
            {REBAR_PATTERN_OPTIONS.map((option) => (
              <button
                type="button"
                key={option.kind}
                className={pattern === option.kind ? 'is-active' : ''}
                title={option.description}
                onClick={() => setPattern(option.kind)}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="pm-rebar-params">
            <label className="pm-field">
              <span>Cover</span>
              <input
                type="number"
                min={0}
                value={params.cover}
                onChange={(event) => updateParam('cover', Number(event.target.value) || 0)}
              />
            </label>
            <label className="pm-field">
              <span>Dia</span>
              <input
                type="number"
                min={1}
                value={params.dia}
                onChange={(event) => updateParam('dia', Number(event.target.value) || 1)}
              />
            </label>
            {showSpacing ? (
              <label className="pm-field">
                <span>Spacing</span>
                <input
                  type="number"
                  min={1}
                  value={params.spacing ?? 100}
                  onChange={(event) => updateParam('spacing', Number(event.target.value) || 1)}
                />
              </label>
            ) : (
              <label className="pm-field">
                <span>Count</span>
                <input
                  type="number"
                  min={1}
                  value={params.count ?? 4}
                  onChange={(event) => updateParam('count', Number(event.target.value) || 1)}
                />
              </label>
            )}
            {appliedSection.solids.length > 1 && (
              <label className="pm-field pm-rebar-params-full">
                <span>Outer</span>
                <select
                  value={params.solidIndex === undefined || params.solidIndex === 'all' ? 'all' : String(params.solidIndex)}
                  onChange={(event) =>
                    updateParam('solidIndex', event.target.value === 'all' ? 'all' : Number(event.target.value))
                  }
                >
                  <option value="all">All outers</option>
                  {appliedSection.solids.map((_, index) => (
                    <option key={index} value={index}>
                      Outer {index + 1}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>

          <div className="pm-rebar-actions">
            <label className="pm-rebar-replace">
              <input
                type="checkbox"
                checked={replaceExisting}
                onChange={(event) => setReplaceExisting(event.target.checked)}
              />
              <span>Replace existing bars</span>
            </label>
            <button type="button" className="pm-table-add-btn" onClick={runGenerate}>
              Generate
            </button>
          </div>
        </div>
      </section>

      <section className="pm-panel-section pm-rebar-list-section">
        <div className="pm-section-title pm-section-title--with-action">
          <h2>Rebar List</h2>
          <span className="pm-rebar-count">{rebars.length} bars</span>
        </div>
        <div className="pm-rebar-excel-actions" role="group" aria-label="Rebar Excel tools">
          <button type="button" onClick={() => importInputRef.current?.click()}>
            <FileInput size={14} />
            Import XLSX
          </button>
          <button type="button" onClick={onExportExcel}>
            <FileOutput size={14} />
            Export XLSX
          </button>
          <input
            ref={importInputRef}
            type="file"
            accept="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.xlsx"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (file) void onImportExcel(file)
            }}
          />
        </div>
        <div className="pm-point-table-wrap pm-rebar-table-wrap">
          <table className="pm-point-table">
            <thead>
              <tr>
                <th>id</th>
                <th>Dia</th>
                <th>Mat</th>
                <th>X</th>
                <th>Y</th>
                <th>
                  <button type="button" className="pm-table-add-icon-btn" onClick={addManualRebar} title="Add bar">
                    <Plus size={14} />
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {rebars.length === 0 && (
                <tr>
                  <td colSpan={6} className="pm-rebar-empty">
                    No bars yet. Use Quick Generate.
                  </td>
                </tr>
              )}
              {rebars.map((bar) => (
                <tr
                  key={bar.id}
                  className={selectedRebarId === bar.id ? 'is-selected' : ''}
                  onClick={() => onSelectRebar(bar.id)}
                >
                  <td>
                    <span className="pm-point-index">{bar.id}</span>
                  </td>
                  <td>
                    <input
                      type="number"
                      min={1}
                      value={bar.dia}
                      aria-label={`Bar ${bar.id} diameter`}
                      onFocus={() => onSelectRebar(bar.id)}
                      onChange={(event) => updateRebar(bar.id, { dia: Number(event.target.value) || 1 })}
                    />
                  </td>
                  <td>
                    <select
                      value={bar.steelMaterialId ?? defaultSteelMaterialId}
                      aria-label={`Bar ${bar.id} steel material`}
                      onFocus={() => onSelectRebar(bar.id)}
                      onChange={(event) => updateRebar(bar.id, { steelMaterialId: Number(event.target.value) })}
                    >
                      {steelMaterials.map((material) => (
                        <option key={material.id} value={material.id}>
                          {material.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      type="number"
                      value={bar.x}
                      aria-label={`Bar ${bar.id} X`}
                      onFocus={() => onSelectRebar(bar.id)}
                      onChange={(event) => updateRebar(bar.id, { x: Number(event.target.value) || 0 })}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      value={bar.y}
                      aria-label={`Bar ${bar.id} Y`}
                      onFocus={() => onSelectRebar(bar.id)}
                      onChange={(event) => updateRebar(bar.id, { y: Number(event.target.value) || 0 })}
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      className="pm-table-icon-btn pm-table-icon-btn--danger"
                      title="Delete bar"
                      onClick={(event) => {
                        event.stopPropagation()
                        deleteRebar(bar.id)
                      }}
                    >
                      <X size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="pm-rebar-list-footer">
          <button
            type="button"
            className="pm-rebar-remove-all"
            disabled={rebars.length === 0}
            onClick={removeAllRebars}
          >
            Remove all
          </button>
        </div>
      </section>
    </>
  )
}
