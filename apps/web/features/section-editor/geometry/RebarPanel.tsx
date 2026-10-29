'use client'

import { QuantityInput, UnitLabel } from '../shared/DisplayUnits'

import { AddIcon, TransferIcon } from '../shared/WorkspaceIcons'
import { useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { X } from 'lucide-react'
import {
  generateRebarsForSection,
  makeRebarId,
  REBAR_PATTERN_OPTIONS,
  equationRebarProperties,
  rebarArea,
  rebarAreaSource,
  rebarAreaSourceLabel,
  type RebarAreaSource,
  type GeometryInputRebarView,
  type RebarGenerateParams,
  type SectionGeometry
} from '@pm/geometry'
import type { SteelMaterial } from '@pm/materials'
import type { RebarGeneratorState } from './rebar-generator-state'

const RebarCatalogDialog = dynamic(() => import('./RebarCatalogDialog').then(module => module.RebarCatalogDialog), { ssr: false })

type Props = {
  generator: RebarGeneratorState
  onGeneratorChange: (state: RebarGeneratorState) => void
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

export function RebarPanel({
  generator,
  onGeneratorChange,
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
  const quickRef = useRef<HTMLDivElement | null>(null)
  const [catalogOpen, setCatalogOpen] = useState(false)
  const [fillRevision, setFillRevision] = useState(0)
  const { pattern, params, replaceExisting } = generator

  const updateParam = <K extends keyof RebarGenerateParams>(key: K, value: RebarGenerateParams[K]) => {
    onGeneratorChange({ ...generator, params: { ...params, [key]: value,
      ...(key === 'dia' || key === 'area' ? { areaSource: { type: 'manual' as const } } : {}) } })
  }

  const fillProperties = (properties: { dia: number; area: number; areaSource: RebarAreaSource }) => {
    onGeneratorChange({ ...generator, params: { ...params, ...properties } })
    setFillRevision(revision => revision + 1)
    setCatalogOpen(false)
  }

  const runGenerate = () => {
    if (!hasAppliedSection) return
    const invalid = quickRef.current?.querySelector<HTMLInputElement>('input[aria-invalid="true"]')
    if (invalid) { invalid.focus(); return }
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
    onChangeRebars(rebars.map((bar) => (bar.id === id ? { ...bar,
      ...(patch.dia !== undefined || patch.area !== undefined ? { area: rebarArea(bar), areaSource: { type: 'manual' as const } } : {}),
      ...patch } : bar)))
  }

  const addManualRebar = () => {
    if (!hasAppliedSection) return
    const invalid = quickRef.current?.querySelector<HTMLInputElement>('input[aria-invalid="true"]')
    if (invalid) { invalid.focus(); return }
    const outer = appliedSection.solids[0]?.outer ?? []
    const xs = outer.map((p) => p.x)
    const ys = outer.map((p) => p.y)
    const targetSolidIndex = typeof params.solidIndex === 'number' ? params.solidIndex : 0
    const bar: GeometryInputRebarView = {
      id: makeRebarId(rebars.map((item) => item.id)),
      x: xs.length ? Math.round((Math.min(...xs) + Math.max(...xs)) / 2) : 0,
      y: ys.length ? Math.round((Math.min(...ys) + Math.max(...ys)) / 2) : 0,
      dia: params.dia || 20,
      area: rebarArea(params),
      areaSource: rebarAreaSource(params),
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
      <>
      <section className="pm-panel-section">
        <div className="pm-section-title">
          <h2>Rebar</h2>
          <button type="button" className="ws-action" onClick={() => setCatalogOpen(true)}>Rebar catalog</button>
        </div>
        <p className="pm-preview-hint">Apply a concrete section first, then generate reinforcement for that section.</p>
      </section>
      {catalogOpen && <RebarCatalogDialog onClose={() => setCatalogOpen(false)} onUse={fillProperties} />}
      </>
    )
  }

  const showSpacing = pattern === 'perimeter-spacing'

  return (
    <>
      <section className="pm-panel-section">
        <div className="pm-rebar-quick" ref={quickRef}>
          <div className="pm-section-title">
            <h2>Quick generate</h2>
            <button type="button" className="ws-action" onClick={() => setCatalogOpen(true)}>Rebar catalog</button>
          </div>
          <div className="pm-rebar-patterns ws-joined-buttons" role="group" aria-label="Rebar patterns">
            {REBAR_PATTERN_OPTIONS.map((option) => (
              <button
                type="button"
                key={option.kind}
                className={"ws-action " + (pattern === option.kind ? 'is-active' : '')}
                aria-pressed={pattern === option.kind}
                title={option.description}
                onClick={() => onGeneratorChange({ ...generator, pattern: option.kind })}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="pm-rebar-params">
            <label className="pm-field">
              <span>Cover</span>
              <QuantityInput quantity="length"
                type="number"
                min={0}
                value={params.cover}
                onValueChange={(canonical) => updateParam('cover', canonical)}
              />
            </label>
            {showSpacing ? (
              <label className="pm-field">
                <span>Spacing</span>
                <QuantityInput quantity="length"
                  type="number"
                  min={1}
                  value={params.spacing ?? 100}
                  onValueChange={(canonical) => updateParam('spacing', canonical)}
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

          <div className="pm-rebar-area">
            <label className="pm-field">
              <span>Dia</span>
              <QuantityInput quantity="barDiameter"
                key={`diameter-${fillRevision}`}
                data-rebar-diameter="true"
                type="number"
                min={1}
                value={params.dia}
                onValueChange={(canonical) => updateParam('dia', canonical)}
              />
            </label>
            <label className="pm-field"><span>As</span>
              <QuantityInput key={`area-${fillRevision}`} quantity="area" aria-label="Generator As" min={Number.MIN_VALUE}
                value={rebarArea(params)} onValueChange={canonical => updateParam('area', canonical)} />
            </label>
            <div className="pm-rebar-area-actions">
              <button type="button" className="ws-action" onClick={() => {
                const invalidDiameter = quickRef.current?.querySelector<HTMLInputElement>('[data-rebar-diameter][aria-invalid="true"]')
                if (invalidDiameter) { invalidDiameter.focus(); return }
                fillProperties(equationRebarProperties(params.dia))
              }}>Equation</button>
              <button type="button" className="ws-action" onClick={() => setCatalogOpen(true)}>Catalog</button>
            </div>
          </div>
          <p className="pm-preview-hint">{rebarAreaSourceLabel(params)}</p>

          <div className="pm-rebar-actions">
            <label className="pm-rebar-replace">
              <input
                type="checkbox"
                checked={replaceExisting}
                onChange={(event) => onGeneratorChange({ ...generator, replaceExisting: event.target.checked })}
              />
              <span>Replace existing bars</span>
            </label>
            <button type="button" className="ws-action ws-action--primary pm-table-add-btn" onClick={runGenerate}>
              Generate
            </button>
          </div>
        </div>
      </section>

      <section className="pm-panel-section ws-table-editor">
        <div className="pm-section-title pm-section-title--with-action">
          <div>
            <h2>
              Rebar list
              <span className="pm-rebar-count">({rebars.length} bars)</span>
            </h2>
          </div>
          <div className="pm-rebar-excel-actions" role="group" aria-label="Rebar Excel tools">
            <button
              type="button"
              className="ws-action pm-file-btn"
              title="Import rebar from Excel"
              onClick={() => importInputRef.current?.click()}
            >
              <TransferIcon direction="import" />
              Excel
            </button>
            <button
              type="button"
              className="ws-action pm-file-btn"
              title="Export rebar to Excel"
              onClick={onExportExcel}
            >
              <TransferIcon direction="export" />
              Excel
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
        </div>
        <div className="pm-point-table-wrap ws-table-scroll">
          <table className="pm-point-table pm-rebar-table">
            {/*
              Root cause of earlier no-ops: browsers discard calc((100% - Npx) * k)
              on <col>, so the editable columns fell back to equal leftover shares.
              Use plain percentages only (no calc). id/action stay px-fixed (30 / 26).
              Flex band: Dia 14% · As 18% · Mat 24% · X 17% · Y 17%.
            */}
            <colgroup>
              <col className="pm-rebar-col pm-rebar-col--id" />
              <col className="pm-rebar-col pm-rebar-col--dia" />
              <col className="pm-rebar-col pm-rebar-col--area" />
              <col className="pm-rebar-col pm-rebar-col--mat" />
              <col className="pm-rebar-col pm-rebar-col--x" />
              <col className="pm-rebar-col pm-rebar-col--y" />
              <col className="pm-rebar-col pm-rebar-col--action" />
            </colgroup>
            <thead>
              <tr>
                <th>id</th>
                <th>Dia (<UnitLabel quantity="barDiameter" />)</th>
                <th>As (<UnitLabel quantity="area" />)</th>
                <th>Mat</th>
                <th>X (<UnitLabel quantity="length" />)</th>
                <th>Y (<UnitLabel quantity="length" />)</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {rebars.length === 0 && (
                <tr>
                  <td colSpan={7} className="pm-rebar-empty">
                    No bars yet. Use Add or Quick generate.
                  </td>
                </tr>
              )}
              {rebars.map((bar) => (
                <tr
                  key={bar.id}
                  className={selectedRebarId === bar.id ? 'is-selected' : ''}
                  onClick={() => onSelectRebar(bar.id)}
                >
                  <td className="pm-rebar-id">{bar.id}</td>
                  <td>
                    <QuantityInput showUnit={false} quantity="barDiameter"
                      type="number"
                      min={1}
                      value={bar.dia}
                      aria-label={`Bar ${bar.id} diameter`}
                      onFocus={() => onSelectRebar(bar.id)}
                      onValueChange={(canonical) => updateRebar(bar.id, { dia: canonical })}
                    />
                  </td>
                  <td>
                    <QuantityInput showUnit={false} quantity="area" min={Number.MIN_VALUE} value={rebarArea(bar)}
                      aria-label={`Bar ${bar.id} As`} title={rebarAreaSourceLabel(bar)}
                      onFocus={() => onSelectRebar(bar.id)} onValueChange={canonical => updateRebar(bar.id, { area: canonical })} />
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
                    <QuantityInput showUnit={false} quantity="length"
                      type="number"
                      value={bar.x}
                      aria-label={`Bar ${bar.id} X`}
                      onFocus={() => onSelectRebar(bar.id)}
                      onValueChange={(canonical) => updateRebar(bar.id, { x: canonical })}
                    />
                  </td>
                  <td>
                    <QuantityInput showUnit={false} quantity="length"
                      type="number"
                      value={bar.y}
                      aria-label={`Bar ${bar.id} Y`}
                      onFocus={() => onSelectRebar(bar.id)}
                      onValueChange={(canonical) => updateRebar(bar.id, { y: canonical })}
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      className="ws-action ws-action--quiet ws-action--danger-quiet ws-action--compact ws-action--icon pm-table-icon-btn pm-table-icon-btn--danger"
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
        <div className="ws-table-actions">
          <button
            type="button"
            className="ws-action ws-action--danger"
            disabled={rebars.length === 0}
            onClick={removeAllRebars}
          >
            Remove all
          </button>
          <button
            type="button"
            className="ws-action ws-action--primary"
            onClick={addManualRebar}
            title="Add bar"
          >
            <span className="ws-action-content"><AddIcon />Add</span>
          </button>
        </div>
      </section>
      {catalogOpen && <RebarCatalogDialog onClose={() => setCatalogOpen(false)} onUse={fillProperties} />}
    </>
  )
}
