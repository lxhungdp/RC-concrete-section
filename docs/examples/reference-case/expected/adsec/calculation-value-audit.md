# AdSec Calculation-Value Audit

Status: **external differential evidence; preview only, not design-code verification**.

This audit intentionally excludes utilization. `P/Mnx/Mny` are compared only at the exact AdSec
strain plane after the complete printed concrete-node and reinforcement strain tables prove the
axis/state mapping within propagated printed precision. AdSec `Myy -> Mnx/Mx` and
`Mzz -> Mny/My`. ACI comparisons use nominal `Pn=P/φ` and `Mn`; `M/φMn` is not used.
ACI concrete is replayed by exact equivalent-block polygon clipping, while its steel strain is
kept on the central printed AdSec plane rather than moved to another deformation state.
`|ΔP| / force scale` uses reconstructed peak concrete force plus design-yield reinforcement
force; every source/engine value and absolute difference remains available in the JSON.

| Report | Solved | Compared | Worst |ΔP| / force scale | Worst ΔM vector | Mesh ΔP | Mesh ΔM |
|---|---:|---:|---:|---:|---:|---:|
| p16-ec2-kds-approximation | 6 | 6 | 0.0087% | 0.0447% | 0.0079% | 0.0153% |
| p16-ec2 | 6 | 6 | 0.0108% | 0.0471% | 0.0027% | 0.0143% |
| p16-aci | 4 | 4 | 0.6232% | 1.9048% | n/a | n/a |
| p16-aci-2 | 8 | 7 | 0.6495% | 1.9048% | n/a | n/a |
| p16-asym-h2-ec2-kds-approximation | 6 | 6 | 0.0177% | 0.0782% | 0.0016% | 0.0049% |
| p16-asym-h2-ec2 | 6 | 6 | 0.0187% | 0.0655% | 0.0017% | 0.0201% |
| p16-asym-h2-aci | 4 | 3 | 0.6560% | 2.1019% | n/a | n/a |
| p16-asym-h2-aci-2 | 6 | 5 | 0.6810% | 2.1019% | n/a | n/a |
| pylon1-cj16-ec2-kds-approximation | 4 | 4 | 0.0270% | 0.0730% | 0.0365% | 0.1110% |
| pylon1-cj16-ec2 | 4 | 4 | 0.0493% | 0.1600% | 0.0748% | 0.2335% |
| pylon1-cj16-aci | 2 | 2 | 0.4462% | 1.6172% | n/a | n/a |
| pylon1-cj16-aci-2 | 4 | 4 | 0.4462% | 1.6172% | n/a | n/a |

Aggregate: 57/60 solved source states compared; 9 total case(s) not comparable, including AdSec No Solution rows.

## Per-case values

### p16-ec2-kds-approximation

| Case | Status | Source P (kN) | Engine P (kN) | Source Mnx (kN·m) | Engine Mx (kN·m) | Source Mny (kN·m) | Engine My (kN·m) | ΔM vector |
|---:|---|---:|---:|---:|---:|---:|---:|---:|
| 1 | compared | 181,800 | 181,750.699 | 86,211.118 | 86,178.571 | 575,276.05 | 575,294.43 | 0.0064% |
| 2 | compared | 122,300 | 122,356.484 | -228,769.266 | -228,815.889 | 470,757.032 | 470,798.377 | 0.0119% |
| 3 | compared | 118,300 | 118,350.471 | 238,460.459 | 238,298.117 | -463,225.225 | -463,392.051 | 0.0447% |
| 4 | compared | 111,000 | 110,941.693 | 203,034.275 | 203,032.978 | 453,417.383 | 453,382.724 | 0.0070% |
| 5 | compared | 173,300 | 173,341.193 | 1,254,000 | 1,254,317.263 | 0 | -0.01 | 0.0253% |
| 6 | compared | 173,000 | 172,942.194 | 0 | 0.044 | 566,000 | 565,937.654 | 0.0110% |

### p16-ec2

| Case | Status | Source P (kN) | Engine P (kN) | Source Mnx (kN·m) | Engine Mx (kN·m) | Source Mny (kN·m) | Engine My (kN·m) | ΔM vector |
|---:|---|---:|---:|---:|---:|---:|---:|---:|
| 1 | compared | 181,800 | 181,764.542 | 85,810.963 | 85,770.906 | 572,605.867 | 572,625.426 | 0.0077% |
| 2 | compared | 122,300 | 122,227.195 | -227,020.933 | -227,194.991 | 467,159.347 | 466,987.528 | 0.0471% |
| 3 | compared | 118,300 | 118,322.179 | 236,583.899 | 236,388.714 | -459,579.883 | -459,701.263 | 0.0445% |
| 4 | compared | 111,000 | 111,044.107 | 201,154.328 | 201,227.273 | 449,219.074 | 449,195.483 | 0.0156% |
| 5 | compared | 173,300 | 173,313.472 | 1,268,000 | 1,267,920.125 | 0 | 0.006 | 0.0063% |
| 6 | compared | 173,000 | 173,038.109 | 0 | 0.143 | 561,100 | 561,168.923 | 0.0123% |

### p16-aci

| Case | Status | Source P (kN) | Engine P (kN) | Source Mnx (kN·m) | Engine Mx (kN·m) | Source Mny (kN·m) | Engine My (kN·m) | ΔM vector |
|---:|---|---:|---:|---:|---:|---:|---:|---:|
| 1 | not-comparable: AdSec reports No Solution; no source strength state or P/Mnx/Mny value exists. | — | — | — | — | — | — | — |
| 2 | compared | 135,888.889 | 129,815.089 | -263,735.909 | -264,041.797 | 542,710.724 | 531,289.656 | 1.8935% |
| 3 | compared | 131,444.444 | 125,413.286 | 274,938.959 | 274,673.062 | -534,087.127 | -522,648.037 | 1.9048% |
| 4 | compared | 123,333.333 | 117,743.266 | 233,154.295 | 233,503.709 | 520,681.596 | 510,029.963 | 1.8681% |
| 5 | compared | 192,555.556 | 189,740.989 | 1,580,000 | 1,570,460.614 | 0 | 0 | 0.6038% |
| 6 | not-comparable: AdSec reports No Solution; no source strength state or P/Mnx/Mny value exists. | — | — | — | — | — | — | — |

### p16-aci-2

| Case | Status | Source P (kN) | Engine P (kN) | Source Mnx (kN·m) | Engine Mx (kN·m) | Source Mny (kN·m) | Engine My (kN·m) | ΔM vector |
|---:|---|---:|---:|---:|---:|---:|---:|---:|
| 1 | not-comparable: local material stress/strain pairs do not match the replay law | — | — | — | — | — | — | — |
| 2 | compared | 135,888.889 | 129,815.089 | -263,735.909 | -264,041.797 | 542,710.724 | 531,289.656 | 1.8935% |
| 3 | compared | 131,444.444 | 125,413.286 | 274,938.959 | 274,673.062 | -534,087.127 | -522,648.037 | 1.9048% |
| 4 | compared | 123,333.333 | 117,743.266 | 233,154.295 | 233,503.709 | 520,681.596 | 510,029.963 | 1.8681% |
| 5 | compared | 192,555.556 | 189,740.989 | 1,580,000 | 1,570,460.614 | 0 | 0 | 0.6038% |
| 6 | compared | 192,222.222 | 185,892.277 | 203,845.964 | 203,848.411 | 646,630.361 | 635,214.352 | 1.6838% |
| 7 | compared | 373,113.073 | 369,411.58 | 391,251.951 | 396,655.265 | 810,285.105 | 806,250.133 | 0.7495% |
| 8 | compared | 353,860.924 | 348,987.893 | 414,676.94 | 426,430.341 | -804,855.388 | -798,117.867 | 1.4963% |

### p16-asym-h2-ec2-kds-approximation

| Case | Status | Source P (kN) | Engine P (kN) | Source Mnx (kN·m) | Engine Mx (kN·m) | Source Mny (kN·m) | Engine My (kN·m) | ΔM vector |
|---:|---|---:|---:|---:|---:|---:|---:|---:|
| 1 | compared | 181,800 | 181,835.308 | 85,959.168 | 85,936.521 | 573,594.823 | 573,752.486 | 0.0275% |
| 2 | compared | 122,300 | 122,346.308 | -230,517.598 | -230,525.183 | 474,354.717 | 474,486.528 | 0.0250% |
| 3 | compared | 118,300 | 118,416.322 | 236,766.978 | 236,477.305 | -459,935.526 | -460,218.169 | 0.0782% |
| 4 | compared | 111,000 | 111,002.868 | 202,707.328 | 202,853.22 | 452,687.242 | 452,704.736 | 0.0296% |
| 5 | compared | 173,300 | 173,391.912 | 1,233,000 | 1,232,871.462 | 0 | -9.178 | 0.0105% |
| 6 | compared | 173,000 | 172,972.872 | 0 | 22.414 | 567,700 | 567,641.96 | 0.0110% |

### p16-asym-h2-ec2

| Case | Status | Source P (kN) | Engine P (kN) | Source Mnx (kN·m) | Engine Mx (kN·m) | Source Mny (kN·m) | Engine My (kN·m) | ΔM vector |
|---:|---|---:|---:|---:|---:|---:|---:|---:|
| 1 | compared | 181,800 | 181,717.083 | 85,825.783 | 85,912.398 | 572,704.762 | 572,566.4 | 0.0282% |
| 2 | compared | 122,300 | 122,324.62 | -228,812.974 | -228,676.789 | 470,846.974 | 470,907.266 | 0.0284% |
| 3 | compared | 118,300 | 118,175.525 | 234,844.648 | 235,098.404 | -456,201.273 | -455,980.977 | 0.0655% |
| 4 | compared | 111,000 | 110,970.795 | 201,072.591 | 200,969.297 | 449,036.539 | 448,971.626 | 0.0248% |
| 5 | compared | 173,300 | 173,302.019 | 1,249,000 | 1,249,359.184 | 0 | 8.506 | 0.0288% |
| 6 | compared | 173,000 | 172,947.962 | 0 | 15.265 | 563,700 | 563,615.8 | 0.0152% |

### p16-asym-h2-aci

| Case | Status | Source P (kN) | Engine P (kN) | Source Mnx (kN·m) | Engine Mx (kN·m) | Source Mny (kN·m) | Engine My (kN·m) | ΔM vector |
|---:|---|---:|---:|---:|---:|---:|---:|---:|
| 1 | not-comparable: AdSec reports No Solution; no source strength state or P/Mnx/Mny value exists. | — | — | — | — | — | — | — |
| 2 | not-comparable: local material stress/strain pairs do not match the replay law | — | — | — | — | — | — | — |
| 3 | compared | 131,444.444 | 125,486.039 | 272,787.78 | 272,504.946 | -529,908.319 | -518,882.421 | 1.8506% |
| 4 | compared | 123,333.333 | 117,040.658 | 233,562.979 | 232,278.268 | 521,594.272 | 509,650.625 | 2.1019% |
| 5 | compared | 192,555.556 | 189,298.045 | 1,561,000 | 1,550,036.256 | 0 | -142.079 | 0.7024% |
| 6 | not-comparable: AdSec reports No Solution; no source strength state or P/Mnx/Mny value exists. | — | — | — | — | — | — | — |

### p16-asym-h2-aci-2

| Case | Status | Source P (kN) | Engine P (kN) | Source Mnx (kN·m) | Engine Mx (kN·m) | Source Mny (kN·m) | Engine My (kN·m) | ΔM vector |
|---:|---|---:|---:|---:|---:|---:|---:|---:|
| 1 | compared | 202,000 | 195,549.925 | 209,663.365 | 215,159.453 | 665,032.754 | 653,490.377 | 1.8334% |
| 2 | not-comparable: local material stress/strain pairs do not match the replay law | — | — | — | — | — | — | — |
| 3 | compared | 131,444.444 | 125,486.039 | 272,787.78 | 272,504.946 | -529,908.319 | -518,882.421 | 1.8506% |
| 4 | compared | 123,333.333 | 117,040.658 | 233,562.979 | 232,278.268 | 521,594.272 | 509,650.625 | 2.1019% |
| 5 | compared | 192,555.556 | 189,298.045 | 1,561,000 | 1,550,036.256 | 0 | -142.079 | 0.7024% |
| 6 | compared | 192,222.222 | 185,689.763 | 235,480.328 | 241,072.72 | 646,872.147 | 634,819.949 | 1.9301% |

### pylon1-cj16-ec2-kds-approximation

| Case | Status | Source P (kN) | Engine P (kN) | Source Mnx (kN·m) | Engine Mx (kN·m) | Source Mny (kN·m) | Engine My (kN·m) | ΔM vector |
|---:|---|---:|---:|---:|---:|---:|---:|---:|
| 1 | compared | 8,090 | 8,133.573 | 124,700 | 124,766.934 | 0 | 0.468 | 0.0537% |
| 2 | compared | 0 | 38.039 | 115,700 | 115,723.297 | 0 | 1.229 | 0.0202% |
| 3 | compared | 8,090 | 8,134.941 | 120,328.967 | 120,383.621 | -53,039.51 | -53,024.278 | 0.0431% |
| 4 | compared | 8,090 | 8,172.181 | 120,328.967 | 120,423.09 | 53,039.51 | 53,020.575 | 0.0730% |

### pylon1-cj16-ec2

| Case | Status | Source P (kN) | Engine P (kN) | Source Mnx (kN·m) | Engine Mx (kN·m) | Source Mny (kN·m) | Engine My (kN·m) | ΔM vector |
|---:|---|---:|---:|---:|---:|---:|---:|---:|
| 1 | compared | 8,090 | 8,146.062 | 121,700 | 121,774.487 | 0 | -1.239 | 0.0612% |
| 2 | compared | 0 | 151.034 | 112,600 | 112,780.111 | 0 | 0.413 | 0.1600% |
| 3 | compared | 8,090 | 8,179.472 | 117,858.335 | 117,982.098 | -51,950.485 | -51,938.525 | 0.0965% |
| 4 | compared | 8,090 | 8,123.63 | 117,858.335 | 117,911.692 | 51,950.485 | 51,946.679 | 0.0415% |

### pylon1-cj16-aci

| Case | Status | Source P (kN) | Engine P (kN) | Source Mnx (kN·m) | Engine Mx (kN·m) | Source Mny (kN·m) | Engine My (kN·m) | ΔM vector |
|---:|---|---:|---:|---:|---:|---:|---:|---:|
| 1 | not-comparable: AdSec reports No Solution; no source strength state or P/Mnx/Mny value exists. | — | — | — | — | — | — | — |
| 2 | not-comparable: AdSec reports No Solution; no source strength state or P/Mnx/Mny value exists. | — | — | — | — | — | — | — |
| 3 | compared | 8,988.889 | 7,085.087 | 137,897.912 | 135,491.795 | -60,783.681 | -60,799.685 | 1.5967% |
| 4 | compared | 8,988.889 | 7,064.056 | 137,897.912 | 135,460.901 | 60,783.681 | 60,798.313 | 1.6172% |

### pylon1-cj16-aci-2

| Case | Status | Source P (kN) | Engine P (kN) | Source Mnx (kN·m) | Engine Mx (kN·m) | Source Mny (kN·m) | Engine My (kN·m) | ΔM vector |
|---:|---|---:|---:|---:|---:|---:|---:|---:|
| 1 | compared | 8,988.889 | 7,554.194 | 140,827.797 | 139,014.859 | 24,830.055 | 24,863.294 | 1.2680% |
| 2 | compared | 0 | -1,258.192 | 130,191.851 | 128,501.148 | 22,954.778 | 22,955.779 | 1.2789% |
| 3 | compared | 8,988.889 | 7,085.087 | 137,897.912 | 135,491.795 | -60,783.681 | -60,799.685 | 1.5967% |
| 4 | compared | 8,988.889 | 7,064.056 | 137,897.912 | 135,460.901 | 60,783.681 | 60,798.313 | 1.6172% |

## Limitations

- The reports are commercial-program evidence, not normative authority.
- Parabolic-rectangular peak stress is reconstructed from the maximum printed AdSec concrete stress; this validates integration/resultants at the reported states, not independent design-code coefficients.
- ACI reports label steel as strain-hardening. The replay is enabled only where all printed strain/stress pairs overlap the elastic-perfectly-plastic response; no hardening branch or ACI edition equivalence is claimed.
- For stress-strain routes, one `h -> h/2` mesh difference is reported as an empirical solution-verification indicator, not Richardson extrapolation or a universal error bound. ACI equivalent-block rows use exact polygon clipping and therefore have no mesh-difference value.
- The repository ACI adapter supplies the equivalent-block law. Agreement is differential evidence only; it does not prove edition equivalence with the source report.
- No UR, adequacy verdict, nearest-angle capacity point, or differently deformed `Mnx/Mny` state is compared.

