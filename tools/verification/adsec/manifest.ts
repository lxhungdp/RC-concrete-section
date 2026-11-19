export type AdsecFamily = 'p16' | 'p16-asym-h2' | 'pylon1-cj16'
export type AdsecRoute = 'ec2-kds-approximation' | 'ec2' | 'aci' | 'aci-2'

export type AdsecManifestEntry = {
  id: string
  file: string
  sha256: string
  family: AdsecFamily
  route: AdsecRoute
  expectedNodes: number
  expectedBars: number
  expectedCases: number
  expectedSolvedCases: number
  outerNodeIds: readonly number[]
  holeNodeIds: readonly (readonly number[])[]
}

const SOURCE_ROOT = 'docs/examples/reference-case/source/adsec'

const p16Geometry = {
  expectedNodes: 8,
  expectedBars: 408,
  outerNodeIds: [1, 2, 3, 4],
  holeNodeIds: [[5, 6, 7, 8]]
} as const

const p16AsymGeometry = {
  expectedNodes: 12,
  expectedBars: 408,
  outerNodeIds: [1, 2, 3, 4],
  holeNodeIds: [[5, 6, 7, 8], [9, 10, 11, 12]]
} as const

/** Node 18 repeats exterior node 2 as an AdSec perimeter separator; it is not a void vertex. */
const pylonGeometry = {
  expectedNodes: 33,
  expectedBars: 232,
  outerNodeIds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17],
  holeNodeIds: [[19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33]]
} as const

export const ADSEC_MANIFEST: readonly AdsecManifestEntry[] = [
  {
    id: 'p16-ec2-kds-approximation',
    file: `${SOURCE_ROOT}/Adsec_P16_Case1-2_KDS근사byEC2.md`,
    sha256: '6d952aaf71249ea5d8d90629866eeede822c3318c490ed5fbd1364cb5ef529dc',
    family: 'p16',
    route: 'ec2-kds-approximation',
    expectedCases: 6,
    expectedSolvedCases: 6,
    ...p16Geometry
  },
  {
    id: 'p16-ec2',
    file: `${SOURCE_ROOT}/Adsec_P16_Case3-2_EC2.md`,
    sha256: 'ed3e176a35723fe97bf83f6f68747c5681a1d9eb5a16154cce92ae32f211e703',
    family: 'p16',
    route: 'ec2',
    expectedCases: 6,
    expectedSolvedCases: 6,
    ...p16Geometry
  },
  {
    id: 'p16-aci',
    file: `${SOURCE_ROOT}/Adsec_P16_Case4-2_ACI.md`,
    sha256: '922c722e861f2d4182abd476d57bb07bf98a4fd35d07f32005b1ecb6f490c603',
    family: 'p16',
    route: 'aci',
    expectedCases: 6,
    expectedSolvedCases: 4,
    ...p16Geometry
  },
  {
    id: 'p16-aci-2',
    file: `${SOURCE_ROOT}/Adsec_P16_Case4-2_ACI-2.md`,
    sha256: 'd9dde9671ebe07594f38cc02d8ede034e4a620b45d5c652dd045151b242794cd',
    family: 'p16',
    route: 'aci-2',
    expectedCases: 8,
    expectedSolvedCases: 8,
    ...p16Geometry
  },
  {
    id: 'p16-asym-h2-ec2-kds-approximation',
    file: `${SOURCE_ROOT}/Adsec_P16-Asym-H2_Case1-2_KDS근사byEC2.md`,
    sha256: '3ecefbeaf104056c63c144e16cfb86e2d0dc77832d76910c59743cf2b51f1dc2',
    family: 'p16-asym-h2',
    route: 'ec2-kds-approximation',
    expectedCases: 6,
    expectedSolvedCases: 6,
    ...p16AsymGeometry
  },
  {
    id: 'p16-asym-h2-ec2',
    file: `${SOURCE_ROOT}/Adsec_P16-Asym-H2_Case3-2_EC2.md`,
    sha256: 'e1e2c018c9450ad82c36de179e13f20a78d01147f28475bb727bd14bb334aee0',
    family: 'p16-asym-h2',
    route: 'ec2',
    expectedCases: 6,
    expectedSolvedCases: 6,
    ...p16AsymGeometry
  },
  {
    id: 'p16-asym-h2-aci',
    file: `${SOURCE_ROOT}/Adsec_P16-Asym-H2_Case4-2_ACI.md`,
    sha256: 'ff2698a5411b1a869a7ad3d47825454e24ac7b2dd7a8d84676e6aaefac4f4d22',
    family: 'p16-asym-h2',
    route: 'aci',
    expectedCases: 6,
    expectedSolvedCases: 4,
    ...p16AsymGeometry
  },
  {
    id: 'p16-asym-h2-aci-2',
    file: `${SOURCE_ROOT}/Adsec_P16-Asym-H2_Case4-2_ACI-2.md`,
    sha256: 'a17dbbc9f92c542b37e84ede28a700c1f4939da3247d970baceab3870ff52488',
    family: 'p16-asym-h2',
    route: 'aci-2',
    expectedCases: 6,
    expectedSolvedCases: 6,
    ...p16AsymGeometry
  },
  {
    id: 'pylon1-cj16-ec2-kds-approximation',
    file: `${SOURCE_ROOT}/Adsec_Pylon1_Case1-2_KDS근사byEC2.md`,
    sha256: '3949b9196ac298bbc5e0b537990260d7b418ee94649df31f7fb56e81e067952b',
    family: 'pylon1-cj16',
    route: 'ec2-kds-approximation',
    expectedCases: 4,
    expectedSolvedCases: 4,
    ...pylonGeometry
  },
  {
    id: 'pylon1-cj16-ec2',
    file: `${SOURCE_ROOT}/Adsec_Pylon1_Case3-2_EC2.md`,
    sha256: '202b7f48c4d918ba12554e5b699e20eb780fe7ce6317be3a922f81e7432eeb9a',
    family: 'pylon1-cj16',
    route: 'ec2',
    expectedCases: 4,
    expectedSolvedCases: 4,
    ...pylonGeometry
  },
  {
    id: 'pylon1-cj16-aci',
    file: `${SOURCE_ROOT}/Adsec_Pylon1_Case4-2_ACI.md`,
    sha256: '76bdc316d01883de6d014a531a5cff8c07574efa8186579c53c2cbc85c004be4',
    family: 'pylon1-cj16',
    route: 'aci',
    expectedCases: 4,
    expectedSolvedCases: 2,
    ...pylonGeometry
  },
  {
    id: 'pylon1-cj16-aci-2',
    file: `${SOURCE_ROOT}/Adsec_Pylon1_Case4-2_ACI-2.md`,
    sha256: '1c99d92d9eaf03c172d9981d9ce83347f615f27b869cdbb680888b5f2e8fa9a2',
    family: 'pylon1-cj16',
    route: 'aci-2',
    expectedCases: 4,
    expectedSolvedCases: 4,
    ...pylonGeometry
  }
]
