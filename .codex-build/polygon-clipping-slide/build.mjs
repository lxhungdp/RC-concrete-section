import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Presentation, PresentationFile } from "@oai/artifact-tool";

const workspaceDir = "F:\\1. Works\\Structures\\p-m";
const buildDir = path.join(workspaceDir, ".codex-build", "polygon-clipping-slide");
const finalPath = path.join(workspaceDir, "outputs", "presentations", "polygon-clipping-section-builder-en-ko-final.pptx");
const skillDir = "C:\\Users\\USER\\.codex\\plugins\\cache\\openai-primary-runtime\\presentations\\26.909.12148\\skills\\presentations";
const runtimePython = "C:\\Users\\USER\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\python\\python.exe";

const { resolvePresentationFont, finalizePresentation } = await import(
  pathToFileURL(path.join(skillDir, "container_tools", "artifact_tool_utils.mjs")).href,
);

await fs.mkdir(buildDir, { recursive: true });
await fs.mkdir(path.dirname(finalPath), { recursive: true });

const family = resolvePresentationFont({ fontFamily: "Malgun Gothic" });
const W = 1280;
const H = 720;
const C = {
  bg: "#F6F4EF",
  paper: "#FFFFFF",
  ink: "#14323C",
  muted: "#66767D",
  teal: "#0A7180",
  tealSoft: "#D8ECEE",
  orange: "#EE7B4A",
  orangeSoft: "#F9DDD0",
  overlap: "#173F4A",
  rule: "#D8DDDA",
  lime: "#B9D96B",
};

const presentation = Presentation.create({ slideSize: { width: W, height: H } });
const slide = presentation.slides.add();
slide.background.fill = C.bg;

function addShape(geometry, left, top, width, height, fill = "none", lineFill = "none", lineWidth = 0, radius = undefined) {
  const shape = slide.shapes.add({
    geometry,
    position: { left, top, width, height },
    fill: fill === "none" ? "none" : { type: "solid", color: fill },
    line: { style: "solid", fill: lineFill, width: lineWidth },
    ...(radius === undefined ? {} : { adjustmentList: [{ name: "adj", formula: radius }] }),
  });
  return shape;
}

function addText(text, left, top, width, height, fontSize, color = C.ink, opts = {}) {
  const box = slide.shapes.add({
    geometry: "textbox",
    position: { left, top, width, height },
    fill: "none",
    line: { fill: "none", width: 0 },
  });
  box.text = text;
  box.text.style = {
    typeface: family,
    fontSize,
    color,
    bold: opts.bold ?? false,
    italic: opts.italic ?? false,
    alignment: opts.align ?? "left",
    verticalAlignment: opts.valign ?? "middle",
    autoFit: "none",
  };
  return box;
}

function addLine(left, top, width, height, color = C.rule, weight = 1) {
  return slide.shapes.add({
    geometry: "line",
    position: { left, top, width, height },
    fill: "none",
    line: { style: "solid", fill: color, width: weight },
  });
}

function addRightArrow(left, top) {
  const arrow = addShape("rightArrow", left, top, 26, 18, C.rule, "none", 0);
  return arrow;
}

function drawCrossInput(x, y) {
  addShape("roundRect", x, y + 18, 78, 42, C.tealSoft, C.teal, 1.5);
  addShape("roundRect", x + 29, y, 42, 78, C.orangeSoft, C.orange, 1.5);
  addShape("rect", x + 29, y + 18, 42, 42, C.overlap, "none", 0);
}

function drawUnionResult(x, y) {
  addShape("roundRect", x, y + 18, 78, 42, C.teal, "none", 0);
  addShape("roundRect", x + 29, y, 42, 78, C.teal, "none", 0);
}

function drawSubtractInput(x, y) {
  addShape("roundRect", x, y + 10, 78, 58, C.tealSoft, C.teal, 1.5);
  addShape("ellipse", x + 25, y + 24, 30, 30, C.orangeSoft, C.orange, 1.5);
}

function drawSubtractResult(x, y) {
  addShape("roundRect", x, y + 10, 78, 58, C.teal, "none", 0);
  addShape("ellipse", x + 25, y + 24, 30, 30, C.bg, C.orange, 1.4);
}

function drawIntersectionResult(x, y) {
  addShape("roundRect", x + 18, y + 18, 42, 42, C.overlap, "none", 0);
}

function operationColumn({ x, symbol, name, korean, description, koreanDescription, code, input, result }) {
  addShape("ellipse", x, 172, 38, 38, C.ink, "none", 0);
  addText(symbol, x, 169, 38, 42, 23, C.paper, { bold: true, align: "center" });
  addText(name, x + 50, 166, 150, 24, 17, C.ink, { bold: true });
  addText(korean, x + 50, 190, 150, 22, 14, C.teal, { bold: true });
  addText("INPUT", x + 8, 224, 76, 18, 10.5, C.muted, { bold: true, align: "center" });
  addText("RESULT", x + 130, 224, 78, 18, 10.5, C.muted, { bold: true, align: "center" });
  input(x + 4, 247);
  addRightArrow(x + 95, 277);
  result(x + 128, 247);
  addText(description, x, 340, 210, 42, 15.5, C.ink, { bold: true });
  addText(koreanDescription, x, 382, 210, 36, 13.5, C.muted);
  addShape("roundRect", x, 427, 210, 29, C.paper, C.rule, 1);
  addText(code, x + 8, 427, 194, 29, 13, C.teal, { bold: true, align: "center" });
}

// Header
addText("P–M COLUMN DESIGNER  /  GEOMETRY ENGINE", 60, 32, 510, 22, 12, C.teal, { bold: true });
addText("Flexible Sections with polygon-clipping", 60, 58, 850, 42, 30, C.ink, { bold: true });
addText("polygon-clipping으로 만드는 자유로운 단면 형상", 60, 103, 780, 30, 19, C.muted, { bold: true });
addShape("roundRect", 955, 42, 264, 30, C.ink, "none", 0);
addText("v0.15.7  ·  MultiPolygon output", 967, 42, 240, 30, 12.5, C.paper, { bold: true, align: "center" });
addText("UNION  ·  DIFFERENCE  ·  INTERSECTION", 933, 78, 300, 22, 11.5, C.teal, { bold: true, align: "center" });
addLine(60, 151, 1160, 0, C.rule, 1.2);

// Operation row
operationColumn({
  x: 60,
  symbol: "∪",
  name: "UNION",
  korean: "합집합",
  description: "Merge selected regions",
  koreanDescription: "선택한 영역을 하나로 결합",
  code: "union(A, B)",
  input: drawCrossInput,
  result: drawUnionResult,
});

addLine(287, 176, 0, 280, C.rule, 1);

operationColumn({
  x: 310,
  symbol: "−",
  name: "SUBTRACT",
  korean: "차집합",
  description: "Cut openings and voids",
  koreanDescription: "개구부와 공극을 생성",
  code: "difference(A, B)",
  input: drawSubtractInput,
  result: drawSubtractResult,
});

addLine(537, 176, 0, 280, C.rule, 1);

operationColumn({
  x: 560,
  symbol: "∩",
  name: "INTERSECTION",
  korean: "교집합",
  description: "Keep only the common area",
  koreanDescription: "겹치는 영역만 유지",
  code: "intersection(A, B)",
  input: drawCrossInput,
  result: drawIntersectionResult,
});

// Region model area
addLine(802, 176, 0, 436, C.rule, 1.2);
addText("REGION MODEL", 840, 166, 240, 26, 18, C.ink, { bold: true });
addText("영역 데이터 모델", 840, 192, 240, 23, 14, C.teal, { bold: true });
addText("Section = Region[]", 1033, 166, 188, 26, 15, C.ink, { bold: true, align: "right" });
addText("단면 = 영역들의 집합", 1033, 192, 188, 23, 12.5, C.muted, { bold: true, align: "right" });

const outer = slide.shapes.add({
  geometry: "custom",
  position: { left: 845, top: 236, width: 314, height: 206 },
  fill: { type: "solid", color: C.teal },
  line: { style: "solid", fill: C.ink, width: 2 },
  customPaths: [{
    width: 314,
    height: 206,
    commands: [
      { moveTo: { x: 0, y: 18 } },
      { lineTo: { x: 88, y: 18 } },
      { lineTo: { x: 88, y: 0 } },
      { lineTo: { x: 205, y: 0 } },
      { lineTo: { x: 205, y: 44 } },
      { lineTo: { x: 314, y: 44 } },
      { lineTo: { x: 314, y: 176 } },
      { lineTo: { x: 250, y: 176 } },
      { lineTo: { x: 250, y: 151 } },
      { lineTo: { x: 118, y: 151 } },
      { lineTo: { x: 118, y: 206 } },
      { lineTo: { x: 0, y: 206 } },
      { close: {} },
    ],
  }],
});
outer.name = "Region 1 outer ring";

const hole1 = addShape("ellipse", 888, 282, 62, 62, C.bg, C.orange, 2);
hole1.name = "Region 1 hole 1";
const hole2 = addShape("roundRect", 1037, 328, 74, 50, C.bg, C.orange, 2);
hole2.name = "Region 1 hole 2";

// A second disconnected region demonstrates MultiPolygon → multiple regions.
const region2 = addShape("hexagon", 1172, 302, 48, 62, C.lime, C.ink, 1.6);
region2.name = "Disconnected Region 2";

addText("OUTER", 852, 247, 80, 22, 11, C.paper, { bold: true });
addText("외곽", 852, 267, 65, 20, 11, C.paper, { bold: true });
addText("HOLE / 홀", 882, 347, 80, 20, 10.5, C.orange, { bold: true, align: "center" });
addText("HOLE / 홀", 1032, 381, 84, 20, 10.5, C.orange, { bold: true, align: "center" });
addText("Region 2", 1165, 371, 64, 20, 10.5, C.ink, { bold: true, align: "center" });

addShape("roundRect", 842, 466, 378, 57, C.paper, C.rule, 1);
addText("Region = 1 outer ring − 0…n hole rings", 858, 470, 346, 24, 15, C.ink, { bold: true, align: "center" });
addText("영역 = 외곽 링 1개 − 내부 홀 링 0…n개", 858, 494, 346, 23, 13.5, C.teal, { bold: true, align: "center" });

addText("Boolean results are normalized to MultiPolygon:", 842, 535, 378, 22, 14, C.ink, { bold: true });
addText("each connected polygon becomes one Region; disconnected results remain multiple Regions.", 842, 558, 378, 38, 13.2, C.muted);
addText("불리언 결과는 MultiPolygon으로 정규화되며, 연결된 폴리곤마다 하나의 영역이 됩니다.", 842, 596, 378, 36, 12.3, C.muted);

// Bottom narrative band
addLine(60, 482, 716, 0, C.rule, 1.2);
addText("FROM PRIMITIVES TO SECTION DATA", 60, 497, 480, 23, 14, C.teal, { bold: true });
addText("기본 도형에서 단면 데이터까지", 60, 520, 480, 22, 13, C.muted, { bold: true });

addShape("roundRect", 60, 552, 716, 62, C.paper, C.rule, 1);
addText("rectangles · circles · custom polygons", 76, 556, 218, 24, 12.5, C.muted, { bold: true, align: "center" });
addText("→", 296, 554, 30, 28, 20, C.orange, { bold: true, align: "center" });
addText("Boolean composition", 326, 556, 176, 24, 13.5, C.ink, { bold: true, align: "center" });
addText("→", 505, 554, 30, 28, 20, C.orange, { bold: true, align: "center" });
addText("MultiPolygon → Region[]", 535, 556, 226, 24, 13.5, C.teal, { bold: true, align: "center" });
addText("사각형 · 원 · 사용자 폴리곤", 76, 583, 218, 22, 11.5, C.muted, { align: "center" });
addText("불리언 조합", 326, 583, 176, 22, 11.5, C.muted, { align: "center" });
addText("복합 단면 형상", 535, 583, 226, 22, 11.5, C.muted, { align: "center" });

// Footer and scope note
addText("Exact polygon boundaries define geometry; meshing remains a separate analysis step.", 60, 648, 770, 21, 12, C.muted);
addText("정확한 폴리곤 경계가 형상을 정의하며, 메시는 별도의 해석 단계입니다.", 60, 669, 770, 20, 11.5, C.muted);
addText("GEOMETRY EDITING · PREVIEW", 1005, 659, 215, 24, 10.5, C.teal, { bold: true, align: "right" });

slide.speakerNotes.textFrame.setText([
  "EN — Presentation notes",
  "• UNION merges all occupied areas from the selected inputs.",
  "• SUBTRACT calls polygon-clipping.difference(A, B) to create openings, voids, or removed zones.",
  "• INTERSECTION keeps only the common area shared by the selected regions.",
  "• The Boolean result is normalized as a MultiPolygon. Each polygon becomes one SectionSolid/Region with one exterior ring and zero or more hole rings. Disconnected polygons remain separate regions.",
  "• This slide describes the geometry-authoring capability, not full structural-code certification.",
  "",
  "KO — 발표 노트",
  "• 합집합은 선택한 형상의 모든 유효 영역을 결합합니다.",
  "• 차집합은 polygon-clipping.difference(A, B)를 사용하여 개구부, 공극 또는 제거 영역을 만듭니다.",
  "• 교집합은 선택한 영역이 공통으로 겹치는 부분만 유지합니다.",
  "• 불리언 결과는 MultiPolygon으로 정규화됩니다. 각 폴리곤은 외곽 링 1개와 내부 홀 링 0개 이상을 가진 하나의 SectionSolid/Region이 되며, 서로 떨어진 폴리곤은 별도 영역으로 유지됩니다.",
  "",
  "Sources: packages/pm-geometry/package.json; packages/pm-geometry/src/index.ts (SectionSolid, SectionGeometry, normalizeClippingResult, composeSectionPrimitives, intersectSectionGeometries).",
].join("\n"));

const preview = await presentation.export({ slide, format: "png", scale: 1 });
await fs.writeFile(path.join(buildDir, "preview.png"), new Uint8Array(await preview.arrayBuffer()));
const layout = await slide.export({ format: "layout" });
await fs.writeFile(path.join(buildDir, "layout.json"), await layout.text());

const candidatePath = path.join(buildDir, "candidate.pptx");
await (await PresentationFile.exportPptx(presentation)).save(candidatePath);

const requirements = {
  explicitTotalSlideCount: 1,
  requiredNativeTableOwnerSlides: [],
  requiredNativeChartOwnerSlides: [],
};

const result = await finalizePresentation({
  ...requirements,
  workspaceDir,
  candidatePath,
  finalPath,
  pythonExecutable: runtimePython,
  integrityValidatorPath: path.join(skillDir, "container_tools", "inspect_presentation_package_integrity.py"),
  layoutValidatorPath: path.join(skillDir, "container_tools", "inspect_presentation_layout_geometry.py"),
  layoutArgs: [
    "--expected-slide-size-emu", "12192000,6858000",
    "--validate-bullet-geometry",
    "--validate-heading-fit",
  ],
  fontPolicy: { basis: "design", families: [family] },
  verifyArtifactToolImport: true,
  receiptPath: path.join(buildDir, "validation-final.json"),
});

console.log(JSON.stringify({ finalPath, previewPath: path.join(buildDir, "preview.png"), result }, null, 2));
