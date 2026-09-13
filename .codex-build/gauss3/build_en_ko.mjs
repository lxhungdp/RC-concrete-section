import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Presentation, PresentationFile } from "@oai/artifact-tool";

const workspaceDir = "/Users/lxh/Coding/Structures/p-m";
const SKILL_DIR = "/Users/lxh/.codex/plugins/cache/openai-primary-runtime/presentations/26.905.11957/skills/presentations";
const TMP_DIR = path.join(workspaceDir, ".codex-build/gauss3");
const FINAL_PPTX = path.join(workspaceDir, "output/gauss-3-point-en-ko-pm-moment-v3.pptx");
const RUNTIME_PYTHON = "/Users/lxh/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3";
const FONT = "Apple SD Gothic Neo";

const { finalizePresentation } = await import(
  pathToFileURL(path.join(SKILL_DIR, "container_tools/artifact_tool_utils.mjs")).href,
);

await fs.mkdir(TMP_DIR, { recursive: true });
await fs.mkdir(path.dirname(FINAL_PPTX), { recursive: true });

const pres = Presentation.create({ slideSize: { width: 1280, height: 720 } });
const slide = pres.slides.add();
slide.background.fill = "#F7F8FA";

function addText(text, position, opts = {}) {
  const shape = slide.shapes.add({
    geometry: "textbox",
    position,
    fill: opts.fill ?? "none",
    line: opts.line ?? { fill: "none", width: 0 },
    borderRadius: opts.borderRadius,
  });
  shape.text = text;
  shape.text.style = {
    typeface: FONT,
    fontSize: opts.fontSize ?? 18,
    bold: opts.bold ?? false,
    color: opts.color ?? "#172033",
    alignment: opts.alignment ?? "left",
    verticalAlignment: opts.verticalAlignment ?? "top",
    autoFit: opts.autoFit ?? "shrinkText",
    wrap: "square",
    lineSpacing: opts.lineSpacing ?? 1,
    insets: opts.insets ?? { top: 2, right: 4, bottom: 2, left: 4 },
  };
  return shape;
}

// Bilingual title block.
addText(
  "Three-point Gaussian quadrature for P–M analysis",
  { left: 62, top: 28, width: 1156, height: 43 },
  { fontSize: 32, bold: true, color: "#10213A", autoFit: "none" },
);
addText(
  "P–M 해석을 위한 삼각형 3점 가우스 구적법",
  { left: 64, top: 71, width: 1152, height: 34 },
  { fontSize: 22, bold: true, color: "#1D4ED8", autoFit: "none" },
);
addText(
  "The triangle stays unchanged. Three optimal points integrate every polynomial of degree ≤ 2 exactly.",
  { left: 65, top: 111, width: 1150, height: 25 },
  { fontSize: 16.5, color: "#526173", autoFit: "none" },
);
addText(
  "삼각형은 그대로 유지된다. 최적의 세 점으로 2차 이하 다항식을 정확히 적분한다.",
  { left: 65, top: 136, width: 1150, height: 25 },
  { fontSize: 16, color: "#526173", autoFit: "none" },
);
slide.shapes.add({
  geometry: "line",
  position: { left: 64, top: 166, width: 1152, height: 0 },
  fill: "none",
  line: { style: "solid", fill: "#D8DEE8", width: 1.2 },
});

// Left: method anatomy and terminology.
addText(
  "Method anatomy / 방법 구성",
  { left: 72, top: 180, width: 510, height: 31 },
  { fontSize: 21, bold: true, color: "#1D4ED8", autoFit: "none" },
);

const tri = slide.shapes.add({
  geometry: "triangle",
  position: { left: 135, top: 220, width: 380, height: 240 },
  fill: "#DCEBFF",
  line: { style: "solid", fill: "#2563EB", width: 3 },
});
tri.shadow = "shadow-sm";

addText("A", { left: 306, top: 196, width: 38, height: 28 }, { fontSize: 18, bold: true, alignment: "center", autoFit: "none" });
addText("B", { left: 101, top: 449, width: 38, height: 28 }, { fontSize: 18, bold: true, alignment: "center", autoFit: "none" });
addText("C", { left: 512, top: 449, width: 38, height: 28 }, { fontSize: 18, bold: true, alignment: "center", autoFit: "none" });

function addPoint(x, y, label, lx, ly) {
  const p = slide.shapes.add({
    geometry: "ellipse",
    position: { left: x - 9, top: y - 9, width: 18, height: 18 },
    fill: "#F97316",
    line: { style: "solid", fill: "#FFFFFF", width: 2 },
  });
  p.shadow = "shadow-sm";
  addText(label, { left: lx, top: ly, width: 34, height: 24 }, { fontSize: 16, bold: true, color: "#9A3412", alignment: "center", autoFit: "none" });
}

// A=(325,220), B=(135,460), C=(515,460).
addPoint(325, 300, "q₁", 307, 269);
addPoint(230, 420, "q₂", 195, 405);
addPoint(420, 420, "q₃", 431, 405);

addText(
  "Parent triangle T\n원삼각형 T",
  { left: 251, top: 349, width: 148, height: 50 },
  { fontSize: 15.5, bold: true, color: "#526173", alignment: "center", verticalAlignment: "middle", autoFit: "none" },
);
addText(
  "Quadrature point qᵢ\n구적점(적분점) qᵢ",
  { left: 446, top: 352, width: 135, height: 52 },
  { fontSize: 14.5, bold: true, color: "#9A3412", alignment: "center", verticalAlignment: "middle", autoFit: "none" },
);

addText(
  "Three-point degree-2 rule / 3점 2차 정확도 규칙",
  { left: 75, top: 481, width: 500, height: 25 },
  { fontSize: 15.5, bold: true, color: "#526173", autoFit: "none" },
);
addText(
  "Barycentric coordinates / 면적좌표    qᵢ = permutations of (⅔, ⅙, ⅙)",
  { left: 75, top: 510, width: 510, height: 25 },
  { fontSize: 15, color: "#334155", autoFit: "none" },
);
addText(
  "Integration weight / 적분 가중치    wᵢ = Aₜ/3",
  { left: 75, top: 538, width: 510, height: 25 },
  { fontSize: 15, color: "#334155", autoFit: "none" },
);
addText(
  "∫ₜ f dA  ≈  Σᵢ wᵢ f(qᵢ)",
  { left: 75, top: 570, width: 510, height: 38 },
  { fontSize: 22, bold: true, color: "#1D4ED8", alignment: "center", autoFit: "none" },
);

// Divider.
slide.shapes.add({
  geometry: "line",
  position: { left: 615, top: 182, width: 0, height: 423 },
  fill: "none",
  line: { style: "solid", fill: "#D8DEE8", width: 1.4 },
});

// Right: P-M moment example.
addText(
  "P–M moment example / P–M 모멘트 예제",
  { left: 648, top: 180, width: 560, height: 31 },
  { fontSize: 21, bold: true, color: "#1D4ED8", autoFit: "none" },
);
addText(
  "Normalized triangle / 정규화 삼각형:  A(0,0), B(1,0), C(0,1),  Aₜ = 1/2",
  { left: 650, top: 218, width: 555, height: 25 },
  { fontSize: 15.2, color: "#526173", autoFit: "none" },
);
addText(
  "Linear stress / 선형 응력:  σ(x,y) = 1 + 2x        Reference axis / 기준축:  x₀ = 0",
  { left: 650, top: 246, width: 555, height: 25 },
  { fontSize: 15.2, color: "#526173", autoFit: "none" },
);

const formulaBox = slide.shapes.add({
  geometry: "roundRect",
  position: { left: 650, top: 279, width: 554, height: 104 },
  fill: "#EAF2FF",
  line: { style: "solid", fill: "#B9D2FF", width: 1.2 },
  borderRadius: 10,
});
formulaBox.text = "Each point / 각 점:   Fᵢ = σᵢAᵢ     Mᵧ,ᵢ = σᵢAᵢdᵢ     dᵢ = xᵢ − x₀\nWith Aᵢ = Aₜ/3:   P = ΣFᵢ = 5/6     Mᵧ = ΣFᵢdᵢ = 1/3";
formulaBox.text.style = {
  typeface: FONT,
  fontSize: 17,
  bold: true,
  color: "#10213A",
  alignment: "center",
  verticalAlignment: "middle",
  autoFit: "none",
  wrap: "square",
  lineSpacing: 1.05,
  insets: { top: 10, right: 14, bottom: 10, left: 14 },
};

const table = slide.tables.add({
  rows: 3,
  columns: 4,
  left: 650,
  top: 397,
  width: 554,
  height: 137,
  columnWidths: [213, 84, 166, 91],
  values: [
    ["Method / 방법", "P", "Mᵧ = Σ(Fᵢ·dᵢ)", "Mᵧ error\n오차"],
    ["1-point centroid\n도심 1점법", "5/6", "5/18 = 0.2778", "−16.7%"],
    ["3-point Gauss\n3점 가우스법", "5/6", "1/3 = 0.3333", "0%"],
  ],
});
table.borders.assign({ style: "solid", fill: "#CBD5E1", width: 1 });
for (let c = 0; c < 4; c++) {
  const cell = table.getCell(0, c);
  cell.fill = "#10213A";
  cell.text.style = {
    typeface: FONT,
    fontSize: 13.2,
    bold: true,
    color: "#FFFFFF",
    alignment: c === 0 ? "left" : "center",
    verticalAlignment: "middle",
    autoFit: "shrinkText",
    insets: { top: 4, right: 6, bottom: 4, left: 6 },
  };
}
for (let r = 1; r < 3; r++) {
  for (let c = 0; c < 4; c++) {
    const cell = table.getCell(r, c);
    cell.fill = r === 1 ? "#FFF4EC" : "#ECFDF3";
    cell.text.style = {
      typeface: FONT,
      fontSize: 13.2,
      bold: c === 0 || c === 3,
      color: r === 1 && c === 3 ? "#C2410C" : r === 2 && c === 3 ? "#15803D" : "#172033",
      alignment: c === 0 ? "left" : "center",
      verticalAlignment: "middle",
      autoFit: "shrinkText",
      insets: { top: 4, right: 6, bottom: 4, left: 6 },
    };
  }
}

addText(
  "Both methods recover P exactly. The moment reveals the error.",
  { left: 654, top: 543, width: 546, height: 25 },
  { fontSize: 15.2, bold: true, color: "#10213A", alignment: "center", autoFit: "none" },
);
addText(
  "두 방법 모두 P는 정확하다. 모멘트에서 오차가 드러난다.",
  { left: 654, top: 568, width: 546, height: 26 },
  { fontSize: 15, bold: true, color: "#10213A", alignment: "center", autoFit: "none" },
);

// Takeaway and limit.
const takeaway = slide.shapes.add({
  geometry: "roundRect",
  position: { left: 64, top: 620, width: 1152, height: 78 },
  fill: "#10213A",
  line: { fill: "none", width: 0 },
  borderRadius: 12,
});
takeaway.text = "Why it matters / 의미: 1-point centroid gives Mᵧ 16.7% too low. 3-point Gauss is exact here.\n도심 1점법은 Mᵧ를 16.7% 작게 계산한다. 3점 가우스법은 정확하다.\nRefine the mesh across a neutral axis or material kink / 중립축·재료곡선 꺾임에서는 메시 세분화 필요";
takeaway.text.style = {
  typeface: FONT,
  fontSize: 14.5,
  bold: true,
  color: "#FFFFFF",
  alignment: "center",
  verticalAlignment: "middle",
  autoFit: "shrinkText",
  wrap: "square",
  lineSpacing: 1.02,
  insets: { top: 8, right: 22, bottom: 8, left: 22 },
};

slide.speakerNotes.textFrame.setText(
  "Technical basis / 기술 근거: docs/02-meshing-2d.md section 5 defines the symmetric three-point degree-2 triangle rule with barycentric coordinates equal to permutations of (2/3,1/6,1/6) and weight A_triangle/3. P-M sign convention follows docs/03-forward-analysis-and-jacobian.md: My = sum(F*(x-x0)). Independent example: on T={(x,y): x>=0,y>=0,x+y<=1}, A=1/2, integral x dA=1/6 and integral x^2 dA=1/12. For sigma=1+2x, P=integral sigma dA=5/6 and My=integral sigma*x dA=1/3. The one-point centroid rule uses G=(1/3,1/3), giving P=(5/3)(1/2)=5/6 but My=P*(1/3)=5/18, which is 16.67% low. The three-point rule returns My exactly because sigma*x has total polynomial degree 2. Values are normalized and illustrative. Nonlinear constitutive kinks and neutral-axis crossings still require mesh refinement and convergence evidence.",
);

const preview = await pres.export({ slide, format: "png", scale: 1 });
await fs.writeFile(path.join(TMP_DIR, "slide-1-en-ko-draft.png"), new Uint8Array(await preview.arrayBuffer()));
const layout = await slide.export({ format: "layout" });
await fs.writeFile(path.join(TMP_DIR, "slide-1-en-ko.layout.json"), await layout.text());

const candidatePath = path.join(workspaceDir, ".codex-finalizer/gauss-3-point-en-ko-candidate.pptx");
await (await PresentationFile.exportPptx(pres)).save(candidatePath);

await finalizePresentation({
  explicitTotalSlideCount: 1,
  requiredNativeTableOwnerSlides: [1],
  requiredNativeChartOwnerSlides: [],
  workspaceDir,
  candidatePath,
  finalPath: FINAL_PPTX,
  pythonExecutable: RUNTIME_PYTHON,
  integrityValidatorPath: path.join(SKILL_DIR, "container_tools/inspect_presentation_package_integrity.py"),
  layoutValidatorPath: path.join(SKILL_DIR, "container_tools/inspect_presentation_layout_geometry.py"),
  layoutArgs: [
    "--expected-slide-size-emu", "12192000,6858000",
    "--validate-bullet-geometry",
    "--validate-heading-fit",
    "--require-native-table-slide", "1",
  ],
  fontPolicy: { basis: "design", families: [FONT] },
  verifyArtifactToolImport: true,
  receiptPath: path.join(workspaceDir, ".codex-finalizer/gauss-3-point-en-ko-v3.validation.json"),
});

console.log(FINAL_PPTX);
