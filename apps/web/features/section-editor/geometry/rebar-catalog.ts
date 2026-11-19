import { convertUnit } from '@pm/units'
import type { RebarAreaSource } from '@pm/geometry'

/** REBAR-AS-004. Scalar dimensional reference facts, accessed 2026-10-27.
 * Source units are retained; conversion happens once at the authoring boundary.
 * These tables make no design-code/grade or engineering-release claim. */
export type RebarCatalogRow = { designation: string; diameter: number; area: number }
export type RebarCatalog = { id: string; tab: string; label: string; sourceName: string; sourceUrl: string; accessedOn?: string;
  table: string; sourceDiameterUnit: string; sourceAreaUnit: string; note: string; rows: readonly RebarCatalogRow[] }
const PUBLISHED_CATALOGS: readonly RebarCatalog[] = [
  {
    "id": "ks-daehan-2021-reference",
    "tab": "KS",
    "label": "KS D3504, 2021 manufacturer guide",
    "sourceName": "Daehan Steel",
    "sourceUrl": "https://drive.google.com/file/d/1OWfN0pqqlIUiKglaaS0WvqJkqZ-yX9Y5/view?usp=drive_link",
    "accessedOn": "2026-10-29",
    "table": "Section 4, dimensions and tolerances, PDF page 2",
    "sourceDiameterUnit": "mm",
    "sourceAreaUnit": "mm²",
    "note": "KS D3504:2021 reference excerpt, Section 4. This is not the 2025 revision.",
    "rows": [
      {
        "designation": "D10",
        "diameter": 9.53,
        "area": 71.33
      },
      {
        "designation": "D13",
        "diameter": 12.7,
        "area": 126.7
      },
      {
        "designation": "D16",
        "diameter": 15.9,
        "area": 198.6
      },
      {
        "designation": "D19",
        "diameter": 19.1,
        "area": 286.5
      },
      {
        "designation": "D22",
        "diameter": 22.2,
        "area": 387.1
      },
      {
        "designation": "D25",
        "diameter": 25.4,
        "area": 506.7
      },
      {
        "designation": "D29",
        "diameter": 28.6,
        "area": 642.4
      },
      {
        "designation": "D32",
        "diameter": 31.8,
        "area": 794.2
      }
    ]
  },
  {
    "id": "us-caltrans-2025-a706-reference",
    "tab": "ASTM US",
    "label": "ASTM A706 Grade 60 per Caltrans BDD 13.1, September 2025",
    "sourceName": "California Department of Transportation",
    "sourceUrl": "https://dot.ca.gov/-/media/dot-media/programs/engineering/documents/bridgedesigndetails/chapter-12/202509bdd131reinforcement-a11y.pdf",
    "table": "Bridge Design Details 13.1, September 2025, Table 13.1.1",
    "sourceDiameterUnit": "in",
    "sourceAreaUnit": "in²",
    "note": "Published dimensional reference only. Selecting a size does not select a steel grade or design profile.",
    "rows": [
      {
        "designation": "#3",
        "diameter": 0.375,
        "area": 0.11
      },
      {
        "designation": "#4",
        "diameter": 0.5,
        "area": 0.2
      },
      {
        "designation": "#5",
        "diameter": 0.625,
        "area": 0.31
      },
      {
        "designation": "#6",
        "diameter": 0.75,
        "area": 0.44
      },
      {
        "designation": "#7",
        "diameter": 0.875,
        "area": 0.6
      },
      {
        "designation": "#8",
        "diameter": 1,
        "area": 0.79
      },
      {
        "designation": "#9",
        "diameter": 1.128,
        "area": 1
      },
      {
        "designation": "#10",
        "diameter": 1.27,
        "area": 1.27
      },
      {
        "designation": "#11",
        "diameter": 1.41,
        "area": 1.56
      },
      {
        "designation": "#14",
        "diameter": 1.693,
        "area": 2.25
      },
      {
        "designation": "#18",
        "diameter": 2.257,
        "area": 4
      }
    ]
  },
  {
    "id": "astm-a615m-20-si-reference-subset",
    "tab": "ASTM SI",
    "label": "ASTM A615/A615M-20, SI basis",
    "sourceName": "ASTM International; copy hosted by VICASA",
    "sourceUrl": "https://vicasasteel.com/Upload/files/ASTM_A615_A615M-20.PDF",
    "table": "Table 1",
    "sourceDiameterUnit": "mm",
    "sourceAreaUnit": "mm²",
    "note": "ASTM A615/A615M-20 Table 1, SI source basis; cross-checked against VIS. SI and US source tables remain independent.",
    "rows": [
      {
        "designation": "10",
        "diameter": 9.5,
        "area": 71
      },
      {
        "designation": "13",
        "diameter": 12.7,
        "area": 129
      },
      {
        "designation": "16",
        "diameter": 15.9,
        "area": 199
      },
      {
        "designation": "19",
        "diameter": 19.1,
        "area": 284
      },
      {
        "designation": "22",
        "diameter": 22.2,
        "area": 387
      },
      {
        "designation": "25",
        "diameter": 25.4,
        "area": 510
      },
      {
        "designation": "29",
        "diameter": 28.7,
        "area": 645
      },
      {
        "designation": "32",
        "diameter": 32.3,
        "area": 819
      },
      {
        "designation": "36",
        "diameter": 35.8,
        "area": 1006
      }
    ]
  },
  {
    "id": "jis-chiyoda-published-reference",
    "tab": "JIS",
    "label": "JIS G3112, Chiyoda published product range",
    "sourceName": "Chiyoda Steel",
    "sourceUrl": "https://www.chiyoda-steel.co.jp/product/Deformed-Bar/",
    "table": "Deformed-bar product dimensions, D10–D25",
    "sourceDiameterUnit": "mm",
    "sourceAreaUnit": "mm²",
    "note": "Published Chiyoda product range (D10–D25); edition unspecified by Chiyoda. Areas cross-checked against VIS's JIS G3112:2020 table.",
    "rows": [
      {
        "designation": "D10",
        "diameter": 9.53,
        "area": 71.33
      },
      {
        "designation": "D13",
        "diameter": 12.7,
        "area": 126.7
      },
      {
        "designation": "D16",
        "diameter": 15.9,
        "area": 198.6
      },
      {
        "designation": "D19",
        "diameter": 19.1,
        "area": 286.5
      },
      {
        "designation": "D22",
        "diameter": 22.2,
        "area": 387.1
      },
      {
        "designation": "D25",
        "diameter": 25.4,
        "area": 506.7
      }
    ]
  },
  {
    "id": "tcvn-1651-2-2018-vis-reference",
    "tab": "TCVN",
    "label": "TCVN 1651-2:2018",
    "sourceName": "Viet Y Steel",
    "sourceUrl": "https://vis.com.vn/thep-thanh",
    "table": "Weight tolerance tables",
    "sourceDiameterUnit": "mm",
    "sourceAreaUnit": "mm²",
    "note": "Published dimensional reference only. Selecting a size does not select a steel grade or design profile.",
    "rows": [
      {
        "designation": "D10",
        "diameter": 10,
        "area": 78.5
      },
      {
        "designation": "D12",
        "diameter": 12,
        "area": 113
      },
      {
        "designation": "D14",
        "diameter": 14,
        "area": 154
      },
      {
        "designation": "D16",
        "diameter": 16,
        "area": 201
      },
      {
        "designation": "D18",
        "diameter": 18,
        "area": 255
      },
      {
        "designation": "D20",
        "diameter": 20,
        "area": 314
      },
      {
        "designation": "D22",
        "diameter": 22,
        "area": 380
      },
      {
        "designation": "D25",
        "diameter": 25,
        "area": 491
      },
      {
        "designation": "D28",
        "diameter": 28,
        "area": 616
      },
      {
        "designation": "D32",
        "diameter": 32,
        "area": 804
      },
      {
        "designation": "D36",
        "diameter": 36,
        "area": 1018
      },
      {
        "designation": "D40",
        "diameter": 40,
        "area": 1257
      },
      {
        "designation": "D50",
        "diameter": 50,
        "area": 1964
      }
    ]
  },
  {
    "id": "as-nzs-4671-2019-australia-reference",
    "tab": "AS/NZS AU",
    "label": "AS/NZS 4671:2019, Table 7.5(A)",
    "sourceName": "Standards Australia / Standards New Zealand; public record hosted by Australian Government",
    "sourceUrl": "https://www.industry.gov.au/sites/default/files/adc/public-record/2025-01/attachment_col-c-1.1_-_as_nzs_4671_2019_-_public_record.pdf",
    "table": "AS/NZS 4671:2019, clause 7.3.1, Tables 7.5(A) and 7.5(B), printed page 12 / PDF page 20",
    "sourceDiameterUnit": "mm",
    "sourceAreaUnit": "mm²",
    "note": "Published dimensional reference only. Selecting a size does not select a steel grade or design profile.",
    "rows": [
      {
        "designation": "N10",
        "diameter": 10,
        "area": 78.5
      },
      {
        "designation": "N12",
        "diameter": 12,
        "area": 113
      },
      {
        "designation": "N16",
        "diameter": 16,
        "area": 201
      },
      {
        "designation": "N20",
        "diameter": 20,
        "area": 314
      },
      {
        "designation": "N24",
        "diameter": 24,
        "area": 452
      },
      {
        "designation": "N28",
        "diameter": 28,
        "area": 616
      },
      {
        "designation": "N32",
        "diameter": 32,
        "area": 804
      },
      {
        "designation": "N36",
        "diameter": 36,
        "area": 1020
      },
      {
        "designation": "N40",
        "diameter": 40,
        "area": 1260
      },
      {
        "designation": "N50",
        "diameter": 50,
        "area": 1960
      }
    ]
  },
  {
    "id": "as-nzs-4671-2019-new-zealand-reference",
    "tab": "AS/NZS NZ",
    "label": "AS/NZS 4671:2019, Table 7.5(B)",
    "sourceName": "Standards Australia / Standards New Zealand; public record hosted by Australian Government",
    "sourceUrl": "https://www.industry.gov.au/sites/default/files/adc/public-record/2025-01/attachment_col-c-1.1_-_as_nzs_4671_2019_-_public_record.pdf",
    "table": "AS/NZS 4671:2019, clause 7.3.1, Tables 7.5(A) and 7.5(B), printed page 12 / PDF page 20",
    "sourceDiameterUnit": "mm",
    "sourceAreaUnit": "mm²",
    "note": "Published dimensional reference only. Selecting a size does not select a steel grade or design profile.",
    "rows": [
      {
        "designation": "6",
        "diameter": 6,
        "area": 28.3
      },
      {
        "designation": "8",
        "diameter": 8,
        "area": 50.3
      },
      {
        "designation": "10",
        "diameter": 10,
        "area": 78.5
      },
      {
        "designation": "12",
        "diameter": 12,
        "area": 113
      },
      {
        "designation": "16",
        "diameter": 16,
        "area": 201
      },
      {
        "designation": "20",
        "diameter": 20,
        "area": 314
      },
      {
        "designation": "25",
        "diameter": 25,
        "area": 491
      },
      {
        "designation": "32",
        "diameter": 32,
        "area": 804
      },
      {
        "designation": "40",
        "diameter": 40,
        "area": 1260
      },
      {
        "designation": "50",
        "diameter": 50,
        "area": 1960
      }
    ]
  },
  {
    "id": "din488-sidenor-published-reference",
    "tab": "DIN",
    "label": "DIN 488, manufacturer edition unspecified",
    "sourceName": "Sidenor",
    "sourceUrl": "https://sidenor.gr/en/products-and-solutions/sd-concrete-reinforcing-steel/sd-concrete-reinforcing-steel/sd-bars-coils/",
    "table": "Diameters, weights and tolerances (bars)",
    "sourceDiameterUnit": "mm",
    "sourceAreaUnit": "mm²",
    "note": "Published Sidenor dimensional reference. The source does not identify a DIN 488 edition.",
    "rows": [
      {
        "designation": "8",
        "diameter": 8,
        "area": 50.3
      },
      {
        "designation": "10",
        "diameter": 10,
        "area": 78.5
      },
      {
        "designation": "12",
        "diameter": 12,
        "area": 113
      },
      {
        "designation": "14",
        "diameter": 14,
        "area": 154
      },
      {
        "designation": "16",
        "diameter": 16,
        "area": 201
      },
      {
        "designation": "18",
        "diameter": 18,
        "area": 254
      },
      {
        "designation": "20",
        "diameter": 20,
        "area": 314
      },
      {
        "designation": "22",
        "diameter": 22,
        "area": 380
      },
      {
        "designation": "25",
        "diameter": 25,
        "area": 491
      },
      {
        "designation": "28",
        "diameter": 28,
        "area": 616
      },
      {
        "designation": "32",
        "diameter": 32,
        "area": 803.8
      },
      {
        "designation": "40",
        "diameter": 40,
        "area": 1257
      }
    ]
  },
  {
    "id": "canada-occdc-reference",
    "tab": "Canada",
    "label": "Canadian M sizes, OCCDC Reference Guide v3",
    "sourceName": "Ontario Cast-in-Place Concrete Development Council; hosted by Reinforcing Steel Institute of Canada",
    "sourceUrl": "https://rebar.org/wp-content/uploads/2017/03/OCCDC-Reference-Guide-V3.pdf",
    "table": "Reinforcing steel bars, PDF page 12",
    "sourceDiameterUnit": "mm",
    "sourceAreaUnit": "mm²",
    "note": "OCCDC reference guide v3, nominal M-size dimensions; no CSA edition or steel grade is selected.",
    "rows": [
      {
        "designation": "10M",
        "diameter": 11.3,
        "area": 100
      },
      {
        "designation": "15M",
        "diameter": 16,
        "area": 200
      },
      {
        "designation": "20M",
        "diameter": 19.5,
        "area": 300
      },
      {
        "designation": "25M",
        "diameter": 25.2,
        "area": 500
      },
      {
        "designation": "30M",
        "diameter": 29.9,
        "area": 700
      },
      {
        "designation": "35M",
        "diameter": 35.7,
        "area": 1000
      },
      {
        "designation": "45M",
        "diameter": 43.7,
        "area": 1500
      },
      {
        "designation": "55M",
        "diameter": 56.4,
        "area": 2500
      }
    ]
  }
]

const BS_REFERENCE: RebarCatalog = {
  id: 'bs-4449-qatar-steel-reference', tab: 'BS', label: 'BS 4449:2005 — Qatar Steel reference',
  sourceName: 'Qatar Steel — Reinforcement Steel Bars',
  sourceUrl: 'https://webdev.qatarsteel.com.qa/wp-content/uploads/2019/01/Reinforcement-Steel-Bars.pdf',
  table: 'Nominal Dimensions, Weight & Tolerance On Knots', sourceDiameterUnit: 'mm', sourceAreaUnit: 'mm²',
  note: 'Published manufacturer dimensional table for its BS 4449:2005 product family. This is not a qualified BS 4449:2005+A3:2016 normative table; no grade or design profile is applied.',
  rows: [
    { designation: 'D8', diameter: 8, area: 50.27 }, { designation: 'D10', diameter: 10, area: 78.54 },
    { designation: 'D12', diameter: 12, area: 113.1 }, { designation: 'D14', diameter: 14, area: 153.9 },
    { designation: 'D16', diameter: 16, area: 201.1 }, { designation: 'D18', diameter: 18, area: 254.5 },
    { designation: 'D20', diameter: 20, area: 314.2 }, { designation: 'D22', diameter: 22, area: 380.1 },
    { designation: 'D25', diameter: 25, area: 490.9 }, { designation: 'D28', diameter: 28, area: 615.8 },
    { designation: 'D30', diameter: 30, area: 706.9 }, { designation: 'D32', diameter: 32, area: 804.2 },
    { designation: 'D36', diameter: 36, area: 1017.9 }, { designation: 'D40', diameter: 40, area: 1256.6 }
  ]
}
export const REBAR_CATALOGS: readonly RebarCatalog[] = [
  ...PUBLISHED_CATALOGS.slice(0, 7), BS_REFERENCE, ...PUBLISHED_CATALOGS.slice(7)
]

export function catalogRebarProperties(catalog: RebarCatalog, row: RebarCatalogRow): {
  dia: number; area: number; areaSource: RebarAreaSource
} {
  if (!catalog.rows.includes(row)) throw new Error('Select a row from the active rebar catalog.')
  const dia = convertUnit('barDiameter', row.diameter, catalog.sourceDiameterUnit, 'mm')
  const area = convertUnit('area', row.area, catalog.sourceAreaUnit, 'mm²')
  return { dia, area, areaSource: { type: 'catalog', dia, area, catalogId: catalog.id,
    designation: row.designation, label: catalog.label, sourceUrl: catalog.sourceUrl } }
}

