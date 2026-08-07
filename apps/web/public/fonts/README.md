# PDF Unicode fallback font

`PMReportUnicode-Regular.ttf` is a renamed, static subset of the official Noto Sans KR variable
font. It covers Latin and Vietnamese, Greek, common engineering symbols, and modern Korean. It is
loaded only when a PDF report is requested and embedded only when a string cannot be represented by
the PDF standard fonts.

The source font is distributed by the Noto CJK project under the SIL Open Font License 1.1. The
license is retained beside the generated font in `OFL.txt`.

Generated file SHA-256:
`8F22C6F5D55861F3792F5F1B1079C8408DA7399F84BFAEBDAFF6EF1C056DEA5D`.

To rebuild on a workstation that has Noto Sans KR and FontTools installed:

```powershell
python tools/fonts/build-report-font.py `
  C:\Windows\Fonts\NotoSansKR-VF.ttf `
  apps/web/public/fonts/PMReportUnicode-Regular.ttf
```
