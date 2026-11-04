# Codex reference measurement ledger

These are user-supplied raster references measured on 2026-09-30 at native
resolution using per-region colour histograms (System.Drawing for sources 1–15;
Pillow with embedded-profile to sRGB conversion for sources 16–17).
Coordinates are zero-based image pixels. Screenshots contain private unrelated
content, so the skill retains measurements and source identifiers, not copies.
Text antialiasing produces intermediate colours: use repeated dark glyph cores,
not a blended edge pixel. Font identity and exact CSS weights are unverified.

## Source 1: application shell

Surface colours are superseded by sources 16–17; geometry evidence remains.

Attachment `codex-clipboard-5ff64799-5c2b-4c71-aa7d-90cb00286b15.png`,
1514 × 827. Dominant flat regions:

| Sample | Pixel/extent | Result |
|---|---|---|
| Outer top | (200,20) | #F0F3F9 |
| Outer rail | (25,400) | #F0F3F9 |
| Sidebar | (100,400) | #FAFBFD |
| Content | (500,400) | #FFFFFF |
| Vertical separator | (374,400) | #E0E2E7 |
| Selected rail target | (25,55), (25,80) | #E4E8ED |
| Top/left frames | content origin near (52,44) | 52px / 44px |

Inner corner radius is optically matched at 16px; right/bottom insets at 3px.
The source sidebar is about 322px. The product starts at 378px for engineering
tables and supports resizing as specified in the UI contract. Icon targets
are reconstructed at 36px with 20px glyphs and 8px gaps.

## Source 2: indicated sidebar hover

The current highlight palette is superseded by sources 16–17.

Attachment `codex-clipboard-b76cc697-c7e0-477b-9dc6-43bd708bc6c3.png`.
The user identifies the highlighted sidebar item as the hover reference.
Pixels (65,305), (150,295), (300,305) all read #EDEFF1.
Sidebar background at (100,400) remains #FAFBFD. This replaces the earlier
inferred hover colour; the rail selection remains a separate token.

## Sources 3 and 4: settings typography, Delete and Import glyph

Browser settings: `codex-clipboard-8aa0c29c-7c92-4c6a-9584-e934189d068a.png`.
Personalization: `codex-clipboard-ce07d57f-c045-41be-a5b9-7703e8c38d35.png`.
The following source-4 regions were sampled as (x,y,width,height):

| Role | Region | Evidence |
|---|---|---|
| Normal sidebar item text | (90,176,165,414) | #1A1C1F: 572 dark pixels |
| Small heading | (650,190,102,18) | #1A1C1F core; antialias shades also present |
| Supporting text | (667,397,180,16) | #6A6B6D: 101 core pixels |
| Delete background | (1306,378,55,28) | #FBEAE9: 1204 pixels |
| Delete text | same region | #E02E2A: 34 core pixels |
| Group separator | (680,301,300,1) | #EDEDED: all 300 pixels |

Chosen optical CSS metrics: small heading 13px/600, ordinary labels 13px/400,
helper text 12px/400. Keep the offline system/Segoe font stack. Delete is 28px
high with an approximately 10px radius, regular 12px text and no visible
outline/shadow. Its darker hover tint is inferred, not photographed.

The Import glyph near (76,246) is a thin downward arrow into an open tray.
The reusable vector is an optical reconstruction: 14px display, 24-unit grid,
1.5-unit stroke, round ends/joins, currentColor, no fill. Place it before the
label. Reuse its upward variant for export; do not claim an extracted vector.

## Carry-forward boundaries

A subsequent user revision requires all standard action buttons to share
normal text, equal height and the input radius. It supersedes the initial
Add-size preservation and the reconstructed Delete dimensions above; those
remain source observations, not current product dimensions. Engineering
status colours and CAD/result palettes are not replaced by this reference. Exact maintained tokens and
resize ownership belong in the [canonical design standard](design-standard.md) and
[workspace implementation map](../../../../docs/development/09-workspace-design-system.md).
No unseen hover/focus/disabled or dark state is established by these images.

## Source 5: dark palette (2026-09-30)

Outer frame, sidebar and highlight colours are superseded by sources 16–17.
Other control/text measurements remain evidence for their own roles.

Attachment `codex-clipboard-426d8f28-7a37-48a3-adfc-c94a40a6eb07.png`,
1566 × 915, sampled at native size with System.Drawing. This source establishes
colour; the user explicitly requires the same geometry and typography as light.

| Role | Sample / region | Evidence |
|---|---|---|
| Outer frame | (400,20), (25,400) | #1D2026; other areas vary slightly |
| Sidebar | (100,300) | #1A1B1D; (100,450) is #191B1E |
| Content | (400,450) | #181818 |
| Card | (600,245) | #232323 |
| Selected/search surface | (200,180), (200,110) | #2C2D2F |
| Group separator | (600,310), (595,567) | #353535 |
| Input interior/border | (1183,645,106,28) | #2A2A2A: 2202 px; #3B3B3B: 192 px |
| Secondary button | (1227,515,62,28) | #2E2E2E: 1385 px |
| Normal item text | (90,207,97,16) | #FFFFFF: 41 core pixels |
| Main header | (578,125,96,27) | #FFFFFF: 380 core pixels |
| Helper text | (595,269,470,16) | #B2B2B2: 246 pixels, brightest repeated ink |
| Enabled switch | (1270,348) | #3A83F7 |

Outer/sidebar variation may reflect compositing; retain representative solid
tokens rather than claiming extracted private CSS. Hover reuses the selected
surface as an inference. White primary actions, muted red destructive actions,
focus and inactive icon ink are adaptations where this screenshot provides no
matching state. CAD/result palettes remain independently owned. The prior
statement that no dark reference existed applies only to sources 1–4.

## Sources 6 and 7: expanded combobox (2026-09-30)

Light: `codex-clipboard-226b0c14-2c9a-4beb-8269-90a6a3684310.png`, 339 x 180.
Dark: `codex-clipboard-4d515d8b-c5bb-4b1e-b2e5-8f7bd14ae260.png`, 325 x 180.
System.Drawing histograms, regions (x,y,width,height):

| Role | Light evidence | Dark evidence |
|---|---|---|
| Trigger | (180,13,106,28): #F2F3F3 2044px, #E1E2E2 105px | (163,17,106,28): #343434 2202px, #454545 192px |
| Popup | (56,43,230,123): #FFFEFF 16211px | (39,47,230,123): #2C2C2C 9451px, #2B2B2B 6933px |
| Highlight | (70,80,190,18): #F2F2F3 1431px | (52,84,194,18): #3C3C3C 1329px |
| Ordinary text | (68,111,80,16): #1A1C1F 32 core pixels | (52,113,80,16): #FFFFFF 32 core pixels |

Popup width is 230px. Rows are about 28px with 4px inner inset. The selected
row has a check at the right while a different hovered row receives the fill.
The 4px trigger gap is an optical choice; 6px radii are the user's explicit
project override. Popup borders and shadows are inferred, not exact CSS extraction.
The nearly white/light grey and dark grey gradients are represented by dominant
solid colours. Closed fields keep the existing shared height/type contract.
The user's later project-wide sizing decision supersedes treating this measured
230px popup as a fixed minimum: a short menu matches its closed trigger and only
longer option content widens it, within the viewport gutter.

Pixel silhouettes in the light image: check region (257,53,17,18) has ink
from approximately (259,56) to (270,65), with the short arm descending right
and a longer ascending right arm. Chevron region (259,21,16,13) has an open V
near (262,25)-(269,29). These are thin rounded strokes, not solid triangles.
Use the maintained 16px SVG check and 12px SVG chevron; path/stroke construction
is an optical reconstruction, not an extracted proprietary icon. Neutral arrow
ink #808080 is an approximation; exact vector, antialiasing and CSS font are unknown.

## Source 8: horizontal disclosure

`codex-clipboard-e3f9ec66-446a-46fb-9e8d-316340c0160b.png`, 255 x 42.
The Help row ends with a thin right-pointing open chevron. Reuse the same
combobox chevron (12px box, 1.2px round stroke) rotated -90 degrees for a collapsed disclosure and down for
an expanded disclosure. This applies to native summaries (including
Thickness-dependent Fy), calculation expanders and legacy parameter groups.
Keep the existing toggle semantics and accessible state; replace only icon
presentation. No separate triangle, heavy arrow or font glyph is permitted.

## Sources 9 and 10: switches in both themes

Dark: `codex-clipboard-8ecbd1ce-1291-4de8-a6f0-d321179d1ea3.png`.
Light: `codex-clipboard-c757b738-7af3-4561-aebd-2bda7bd5f601.png`.
System.Drawing samples at native resolution on 2026-09-30:

| State | Region (x,y,w,h) | Dominant evidence |
|---|---|---|
| Dark on | (690,24,32,20) | #3A83F7 284px; #FFFFFF 156px; #232323 outside corners 68px |
| Light on | (688,28,32,20) | #3A83F7 284px; #FFFFFF 224px including outside corners |
| Light off, source 3 | (1064,507,32,20) | #E8E8E8 292px; #FFFFFF 232px including outside corners |
| Dark off, source 5 | (1257,830,32,20) | #393939 306px; #FFFFFF 156px; #232323 outside corners 68px |

The source-3 enabled switch at (1064,236,32,20) and source-5 enabled switch at
(1257,347,32,20) confirm the same 284 blue core pixels. Both new crops show a
32 x 20px pill, a white 16px circular thumb inset 2px and no separate border.
The thumb travels 12px. Use a borderless CSS circle/pill at these dimensions;
no font icon, image scaling or shadow is needed. Borderless neutral off tracks
replace the previous blue-grey outlined control. Disabled opacity, focus and
animation are inferred accessibility treatments, not measured screenshot states.

## Sources 11 and 12: Add action icon

Initial: `codex-clipboard-a55037d4-6aea-4fea-94dc-fcda32b9d0d4.png`.
Final smaller reference: `codex-clipboard-4aa28a0e-a948-4b68-b1d6-5964758345d3.png`.
Native-resolution System.Drawing pixel silhouettes on 2026-09-30 show the first
cross at approximately x27-38/y20-31 (12px ink footprint). The later Add-entry
image has x63-72/y18-27 (10px footprint), centred near (67.5,22.5). The later
explicit size request governs. Both are symmetric thin horizontal/vertical
strokes, not the font's plus glyph. The maintained optical reconstruction is
one 12px SVG box with a 9-unit path per axis, 1.2px rounded stroke, currentColor
and no fill. Antialiasing and original vector stroke values cannot be extracted
exactly from the raster. Keep the shared 26px button height and 6px corner radius;
the screenshot does not override those earlier user decisions. Add and other
creation actions reuse one fresh-node factory, including embedded Alignment
controls decorated by the host; no duplicated SVG paths per feature.

## Source 13: important title and calculated-value emphasis

Attachment `codex-clipboard-4ab0fe6d-4ffd-488f-bdc2-1b45c657a2a8.png`,
760 x 136. The repeated fully covered glyph cores in both blue item titles are
RGB (44, 103, 197), or `#2c67c5`; lighter blues at the character edges are
antialiasing blends. This measured light colour defines `--ui-emphasis-text`
for key entity titles and automatically calculated values. The screenshot does
not establish a dark state, so `#78a9f5` is an explicit contrast-preserving
adaptation for dark surfaces. It is not a replacement for ordinary text,
helper text, input values, actions or engineering status colours.

## Sources 14 and 15: warning and attention ink

Light: `codex-clipboard-8f05a2af-3b72-4040-99a2-d2741d2840e2.png`,
593 x 111. Dark: `codex-clipboard-5d3684e6-b253-4a9d-af05-23ec2159e0aa.png`,
715 x 114. Native RGB histograms isolate repeated fully covered orange glyph
cores at (226, 85, 7), or `#e25507`, in light and (255, 133, 73), or `#ff8549`,
in dark. Lighter and darker nearby values are antialiasing blends against each
surface. In both references the shield icon and `Elevated risk` label use the
orange; `Enable full CDP access` remains normal text and the explanation stays
muted. The screenshots show no dedicated orange warning surface, so the
maintained translucent warning background and border are inferred adaptations
for existing semantic status cards.

## Sources 16 and 17: revised three-region Settings palette

Light: `codex-clipboard-cbde05ee-df2f-435d-8c29-2d4918c56fb9.png`, 848 × 874.
Dark: `codex-clipboard-747900dc-05b1-4947-947a-b881178d78e8.png`, 876 × 826.
Measured on 2026-09-30 with Pillow at native resolution, converting the embedded
`Display` ICC profile to sRGB before comparison with CSS hex values. Regions
below use `(x,y,width,height)`; counts exclude no pixels within those rectangles.

| Role / region | Light | Dark |
|---|---|---|
| Top (320,10,500,50) | #F4F4F3, 25,000 px | #373838, 22,123 px; #383838, 2,481 px |
| Left rail (5,250,20,300) | #EBE9E7, 1,800 px; #EDE9E7, 1,389 px | #2D2927, 2,024 px; #2B2927, 1,952 px |
| Sidebar (450,300,200,240) | #FBFBFB, 48,000 px | #232323, 20,922 px; #232324, 12,137 px; #242424, 11,693 px |
| Appearance highlight (440,580,180,30) | #EEEFEF, 5,400 px | #343434, 2,459 px; #343435, 1,302 px |
| Main area (700,120,120,630) | #FFFFFF, 75,600 px | #181818, 75,600 px |
| Sidebar separator | (678,300,1,240): #E3E3E3, 240 px | (676,300,1,240): #484848, 240 px |
| Top workspace outline | (400,85): #E8E8E8 | (400,81): #424343 |

The left edge is warmer than the top plateau. Along y=10, source light changes
from approximately #EBE9E7 to #F4F4F3 by x=200; dark changes from #2D2927 to
#373838 by x=240. The shared bounded horizontal shell gradient is an optical
adaptation at the existing product scale, not recovered window-compositing CSS.
Small vertical variations and edge shadows are not separate surface tokens.

The static Appearance highlight does not prove hover versus selection. The
user's follow-up explicitly adopts these images for the three regions, so the
same measured fill is used for both sidebar states; existing selection indicators
remain. Earlier field, combobox, switch, text and action evidence stays in force.
The later user correction explicitly preserves the original CAD WebGL background.
Main-area measurements govern CSS only; the opaque dark CAD clear colour remains
approximately #28282C. No drawing-palette colour changes with this chrome revision.
Current token values and gradient extent belong only in UI Theme and its CSS.

## Source 18: dark Properties content container

`codex-clipboard-f6525d64-db2a-4558-8d88-cade6b4ab2e9.png`, 1574 × 718.
Pillow sampling after embedded Display ICC conversion to sRGB:
outer (0,0,50,700) is #181818 (35,000 pixels); interior
(70,60,1430,590) has dominant #232323 (750,318 pixels); top outline
(300,48,900,2) is #353535 (1,800 pixels); divider
(95,169,1388,2) is #353535 (2,776 pixels). Inset field is #2c2c2c.
The user adopts the container and border colours for Properties while keeping
project radii. Light colours remain an adaptation from existing tokens.
Reference text, dimensions and large corner radius are not new requirements.
