# Material Model Pipeline

Material definitions are intentionally scoped to reinforced-concrete P-M section analysis.
They describe uniaxial stress-strain behavior, strain limits, and code factors.
The section solver should consume compiled material functions instead of branching on design standards.

## Store

```ts
type MaterialStore = {
  unit: 'MPa'
  strainSign: 'compression-positive'
  concrete: ConcreteMaterial
  steel: SteelMaterial[]
  defaults: {
    steelMaterialId: string
  }
}
```

## Geometry Relation

Concrete material is the default material of the section.
Steel material belongs to each rebar.

```ts
type GeometryInputRebar = {
  id: string
  steelMaterialId?: string
  dia: number
  x: number
  y: number
}
```

## Solver Contract

Every design-standard material is compiled to the same runtime shape.

```ts
type CompiledMaterial = {
  id: string
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
