import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Presentation, PresentationFile } from "@oai/artifact-tool";

const workspaceDir = "/Users/lxh/Coding/Structures/p-m";
const SKILL_DIR = "/Users/lxh/.codex/plugins/cache/openai-primary-runtime/presentations/26.905.11957/skills/presentations";
const TMP_DIR = path.join(workspaceDir, ".codex-build/gauss3");
const FINAL_PPTX = path.join(workspaceDir, "output/quy-tac-gauss-3-diem-tren-tam-giac.pptx");
const RUNTIME_PYTHON = "/Users/lxh/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3";
const FONT = "Arial";

const { applyPresentationChartFont, finalizePresentation } = await import(
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
    fontSize: opts.fontSize ?? 20,
    bold: opts.bold ?? false,
    color: opts.color ?? "#172033",
    alignment: opts.alignment ?? "left",
    verticalAlignment: opts.verticalAlignment ?? "top",
    autoFit: opts.autoFit ?? "shrinkText",
    wrap: "square",
    lineSpacing: opts.lineSpacing ?? 1.0,
    insets: opts.insets ?? { top: 2, right: 4, bottom: 2, left: 4 },
  };
  return shape;
}

// Title and rule.
addText(
  "Gauss 3 điểm nâng độ chính xác ngay trong mỗi tam giác",
  { left: 64, top: 38, width: 1152, height: 54 },
  { fontSize: 37, bold: true, color: "#10213A", autoFit: "none" },
);
addText(
  "Tam giác giữ nguyên. Ba vị trí và ba trọng số được chọn để tích phân chính xác mọi đa thức bậc ≤ 2.",
  { left: 67, top: 94, width: 1120, height: 36 },
  { fontSize: 19, color: "#526173", autoFit: "none" },
);
slide.shapes.add({
  geometry: "line",
  position: { left: 64, top: 133, width: 1152, height: 0 },
  fill: "none",
  line: { style: "solid", fill: "#D8DEE8", width: 1.3 },
});

// Left-side explanatory diagram.
addText(
  "Một tam giác, ba điểm tích phân",
  { left: 76, top: 153, width: 525, height: 34 },
  { fontSize: 23, bold: true, color: "#1D4ED8", autoFit: "none" },
);

const tri = slide.shapes.add({
  geometry: "triangle",
  position: { left: 158, top: 188, width: 430, height: 305 },
  fill: "#DCEBFF",
  line: { style: "solid", fill: "#2563EB", width: 3 },
});
tri.shadow = "shadow-sm";

// Vertex labels.
addText("A", { left: 360, top: 163, width: 40, height: 30 }, { fontSize: 20, bold: true, alignment: "center", autoFit: "none" });
addText("B", { left: 126, top: 479, width: 40, height: 30 }, { fontSize: 20, bold: true, alignment: "center", autoFit: "none" });
addText("C", { left: 584, top: 479, width: 40, height: 30 }, { fontSize: 20, bold: true, alignment: "center", autoFit: "none" });

function addPoint(x, y, label, labelX, labelY) {
  const p = slide.shapes.add({
    geometry: "ellipse",
    position: { left: x - 10, top: y - 10, width: 20, height: 20 },
    fill: "#F97316",
    line: { style: "solid", fill: "#FFFFFF", width: 2 },
  });
  p.shadow = "shadow-sm";
  addText(label, { left: labelX, top: labelY, width: 38, height: 25 }, { fontSize: 17, bold: true, color: "#9A3412", alignment: "center", autoFit: "none" });
}

// For an isosceles triangle: A=(373,188), B=(158,493), C=(588,493).
// q_A=(2/3,1/6,1/6), q_B and q_C are its cyclic permutations.
addPoint(373, 290, "q₁", 352, 260);
addPoint(265.5, 442.2, "q₂", 227, 428);
addPoint(480.5, 442.2, "q₃", 492, 428);

addText(
  "Tọa độ barycentric",
  { left: 86, top: 515, width: 215, height: 28 },
  { fontSize: 17, bold: true, color: "#526173", autoFit: "none" },
);
addText(
  "hoán vị của  (⅔, ⅙, ⅙)",
  { left: 86, top: 544, width: 260, height: 34 },
  { fontSize: 21, bold: true, color: "#10213A", autoFit: "none" },
);
addText(
  "Trọng số mỗi điểm",
  { left: 362, top: 515, width: 205, height: 28 },
  { fontSize: 17, bold: true, color: "#526173", autoFit: "none" },
);
addText(
  "w = Aₜ / 3",
  { left: 362, top: 544, width: 210, height: 34 },
  { fontSize: 23, bold: true, color: "#10213A", autoFit: "none" },
);

addText(
  "∫ₜ f dA  ≈  Aₜ/3 · [ f(q₁) + f(q₂) + f(q₃) ]",
  { left: 86, top: 584, width: 505, height: 42 },
  { fontSize: 22, bold: true, color: "#1D4ED8", autoFit: "none", alignment: "center" },
);

// Thin divider.
slide.shapes.add({
  geometry: "line",
  position: { left: 633, top: 160, width: 0, height: 465 },
  fill: "none",
  line: { style: "solid", fill: "#D8DEE8", width: 1.4 },
});

// Right-side numerical evidence.
addText(
  "Ví dụ chứng minh độ chính xác",
  { left: 672, top: 153, width: 510, height: 34 },
  { fontSize: 23, bold: true, color: "#1D4ED8", autoFit: "none" },
);
addText(
  "Tam giác chuẩn: (0,0), (1,0), (0,1)     Hàm cần tích phân:  f(x,y) = x²",
  { left: 674, top: 194, width: 530, height: 34 },
  { fontSize: 17.5, color: "#526173", autoFit: "none" },
);
addText(
  "Giá trị đúng:  ∫ₜ x² dA = 1/12 = 0,0833",
  { left: 674, top: 232, width: 530, height: 36 },
  { fontSize: 21, bold: true, color: "#10213A", autoFit: "none" },
);
addText(
  "Kết quả chuẩn hóa  (giá trị đúng = 100)",
  { left: 674, top: 280, width: 505, height: 29 },
  { fontSize: 17, bold: true, color: "#526173", autoFit: "none" },
);

const chart = slide.charts.add("bar", {
  position: { left: 670, top: 310, width: 525, height: 245 },
  categories: ["Giá trị đúng", "Gauss 3 điểm", "Chia 3 phần + trọng tâm"],
  series: [{ name: "Kết quả", values: [100, 100, 81.5], fill: "#2563EB" }],
  barOptions: { direction: "bar", grouping: "clustered", varyColors: true, gapWidth: 52 },
  hasLegend: false,
  xAxis: {
    visible: false,
    min: 0,
    max: 112,
    majorGridlines: null,
    line: { fill: "none", width: 0 },
  },
  yAxis: {
    visible: true,
    textStyle: { typeface: FONT, fill: "#334155", fontSize: 14, bold: true },
    line: { fill: "none", width: 0 },
    majorGridlines: null,
  },
  dataLabels: {
    showValue: true,
    position: "outEnd",
    textStyle: { typeface: FONT, fill: "#10213A", fontSize: 14, bold: true },
  },
  chartFill: "#F7F8FA",
  chartLine: { fill: "none", width: 0 },
  plotAreaFill: "#F7F8FA",
  plotAreaLine: { fill: "none", width: 0 },
});
applyPresentationChartFont(chart, { fontFamily: FONT });

addText(
  "Gauss 3 điểm: sai số 0%",
  { left: 696, top: 551, width: 230, height: 32 },
  { fontSize: 18, bold: true, color: "#15803D", alignment: "center", autoFit: "none" },
);
addText(
  "Chia 3 phần: sai số −18,5%",
  { left: 938, top: 551, width: 258, height: 32 },
  { fontSize: 18, bold: true, color: "#C2410C", alignment: "center", autoFit: "none" },
);
addText(
  "Ví dụ dùng cùng 3 lần đánh giá hàm. Sai số −18,5% chỉ thuộc ví dụ này.",
  { left: 682, top: 587, width: 506, height: 28 },
  { fontSize: 14.5, color: "#6B7280", alignment: "center", autoFit: "none" },
);

// Bottom takeaway band.
const takeaway = slide.shapes.add({
  geometry: "roundRect",
  position: { left: 64, top: 641, width: 1152, height: 55 },
  fill: "#10213A",
  line: { fill: "none", width: 0 },
  borderRadius: 12,
});
takeaway.text = "Trong P–M: trường ứng suất trơn thường cần ít tam giác hơn. Vẫn phải tinh chỉnh mesh khi tam giác cắt trục trung hòa hoặc điểm gãy vật liệu.";
takeaway.text.style = {
  typeface: FONT,
  fontSize: 18,
  bold: true,
  color: "#FFFFFF",
  alignment: "center",
  verticalAlignment: "middle",
  autoFit: "none",
  wrap: "square",
  insets: { top: 7, right: 22, bottom: 7, left: 22 },
};

slide.speakerNotes.textFrame.setText(
  "Nguồn kỹ thuật: docs/02-meshing-2d.md, mục 5. Quy tắc dùng ba điểm barycentric là các hoán vị của (2/3, 1/6, 1/6), mỗi điểm có trọng số A_triangle/3, và tích phân chính xác đa thức đến bậc 2. Ví dụ kiểm tra độc lập trên tam giác chuẩn T={(x,y): x>=0, y>=0, x+y<=1}: tích phân x^2 bằng 1/12. Quy tắc Gauss cho đúng 1/12. Nếu nối trọng tâm với ba đỉnh và dùng một điểm trọng tâm trên mỗi tam giác con, kết quả bằng 11/162, tương đương 81,48% giá trị đúng, sai số -18,52%. Đây là ví dụ minh họa, không phải sai số phổ quát. Với quan hệ vật liệu phi tuyến hoặc điểm gãy nằm trong tam giác, vẫn cần kiểm tra hội tụ theo mesh.",
);

const preview = await pres.export({ slide, format: "png", scale: 1 });
await fs.writeFile(path.join(TMP_DIR, "slide-1-draft.png"), new Uint8Array(await preview.arrayBuffer()));
const layout = await slide.export({ format: "layout" });
await fs.writeFile(path.join(TMP_DIR, "slide-1.layout.json"), await layout.text());

const candidatePath = path.join(workspaceDir, ".codex-finalizer/gauss-3-diem-candidate.pptx");
await (await PresentationFile.exportPptx(pres)).save(candidatePath);

await finalizePresentation({
  explicitTotalSlideCount: 1,
  requiredNativeTableOwnerSlides: [],
  requiredNativeChartOwnerSlides: [1],
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
  ],
  fontPolicy: { basis: "design", families: [FONT] },
  verifyArtifactToolImport: true,
  materializeLiteralChartWorkbooks: true,
  receiptPath: path.join(workspaceDir, ".codex-finalizer/gauss-3-diem.validation.json"),
});

console.log(FINAL_PPTX);
