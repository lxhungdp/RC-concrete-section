# Material Model Pipeline

Material definitions are intentionally scoped to reinforced-concrete P-M section analysis.
They describe uniaxial stress-strain behavior, strain limits, and code factors.
The section solver should consume compiled material functions instead of branching on design standards.

## Store

```ts
type MaterialStore = {
  strainSign: 'compression-positive'
  concrete: ConcreteMaterial  // id always 1
  steel: SteelMaterial[]      // ids 1, 2, 3… in steel namespace
  defaults: {
    steelMaterialId: number
  }
}
```

Stress unit is implicitly **MPa** (not stored in JSON). Material `name` is display-only;
rebars reference steel via integer `steelMaterialId`.

Concrete also stores density `mc` (kg/m³, default 2350) for the KDS Ec formula.

### KDS derived fields

When `standard === 'KDS'`:

- Changing **fc** or **mc**, or selecting KDS, recomputes **Ec** and **εcu**.
- Ec = `0.077 · mc^1.5 · fcm^(1/3)` with fcm = fc+4 (fc≤40), fc+6 (fc≥60), else 1.1·fc.
- When model is also `kds-parabolic`, **εc0** and **n** are recomputed from fc.

Users may edit Ec / εcu / εc0 / n directly; the next KDS auto pass overwrites them.
`alpha` remains stored on the model but is not driven by UI yet.

## Geometry Relation

Concrete material is the default material of the section.
Steel material belongs to each rebar.

```ts
type GeometryInputRebar = {
  id: number
  steelMaterialId?: number
  dia: number
  x: number
  y: number
}
```

## Solver Contract

Every design-standard material is compiled to the same runtime shape.

```ts
type CompiledMaterial = {
  id: number
  family: 'concrete' | 'steel'
  stress: (strain: number) => number
  tangent: (strain: number) => number
  limits: {
    epsCompressionUltimate?: number
    epsTensionUltimate?: number
    epsYield?: number
  }
}
```

Current concrete models:

- `kds-parabolic`
- `aci-whitney-block`
- `ec2-parabolic-rectangular`
- `user-curve`

Current steel models:

- `elastic-perfectly-plastic`
- `bilinear`
- `user-curve`

## Persistence

Material definitions are stored inside `PmProjectDocument.inputs.materials` (`@pm/project`).
Export / import JSON round-trips the definition store; solvers must call `compileMaterialStore` after open.

Entity ids use `@pm/ids` (`nextAvailableId` gap-fill). Concrete id is fixed at `1`.
