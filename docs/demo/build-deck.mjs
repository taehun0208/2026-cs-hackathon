import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const runtimeModules = process.env.ARTIFACT_RUNTIME_MODULES;
const packageEntry = runtimeModules
  ? createRequire(path.join(runtimeModules, "..", "demo-loader.cjs")).resolve(
      "@oai/artifact-tool",
    )
  : "@oai/artifact-tool";
const { Presentation, PresentationFile } = await import(
  packageEntry.startsWith("/") ? pathToFileURL(packageEntry).href : packageEntry
);
const build = path.join(root, "work/demo-build");
const out = path.join(root, "deliverables/demo");
await fs.mkdir(build, { recursive: true });
await fs.mkdir(path.join(out, "previews"), { recursive: true });
const p = Presentation.create({ slideSize: { width: 1280, height: 720 } });
const FONT = "Pretendard",
  CODE = "Menlo";
const C = {
  ink: "#191F28",
  secondary: "#4E5968",
  muted: "#657181",
  blue: "#2563EB",
  line: "#E5E8EB",
  paper: "#F9FAFB",
  white: "#FFFFFF",
};
function text(
  s,
  name,
  value,
  x,
  y,
  w,
  h,
  size = 24,
  color = C.ink,
  bold = false,
  family = FONT,
) {
  const sh = s.shapes.add({
    geometry: "textbox",
    name,
    position: { left: x, top: y, width: w, height: h },
    fill: "none",
    line: { fill: "none", width: 0 },
  });
  sh.text = value;
  sh.text.style = {
    typeface: family,
    fontSize: size + "pt",
    bold,
    color,
    insets: 0,
    verticalAlignment: "top",
    autoFit: "none",
    wrap: "square",
    lineSpacing: 1.15,
  };
  return sh;
}
function slide(title, notes) {
  const s = p.slides.add();
  s.background.fill = C.white;
  if (title) text(s, "title", title, 72, 54, 1136, 82, 32, C.ink, true);
  s.speakerNotes.text = notes;
  return s;
}
function note(s, value) {
  text(s, "evidence-note", value, 72, 662, 1136, 36, 14, C.muted);
}
async function shot(s, file, frame, crop) {
  const b = await fs.readFile(path.join(root, file));
  s.images.add({
    blob: b,
    contentType: "image/jpeg",
    alt: "해보기 서비스의 기능 점검용 QA 화면",
    fit: "contain",
    position: frame,
    ...(crop ? { crop } : {}),
  });
}
// 1. Cover
let s = slide(
  "",
  `서비스: https://haebogi-career-lab.vercel.app\n코드: https://github.com/taehun0208/2026-cs-hackathon\n제품 범위 근거: docs/IMPLEMENTATION.md. 학생 효과 측정 결과는 아직 없습니다.`,
);
text(s, "product-name", "해보기", 72, 138, 1100, 130, 68, C.ink, true);
text(
  s,
  "product-definition",
  "작은 업무로 시작하는\n개발 직무 탐색",
  72,
  290,
  1136,
  180,
  35,
  C.ink,
  false,
);
text(s, "event", "2026 컴학 해커톤", 72, 568, 1000, 45, 19, C.secondary);
text(
  s,
  "service-url",
  "haebogi-career-lab.vercel.app",
  72,
  623,
  1100,
  40,
  18,
  C.blue,
);
// 2. Problem hypothesis
s = slide(
  "직무를 고르기 전, 필요한 경험",
  `기획 가설입니다. 학생 인터뷰의 인용이나 관찰 결과가 아닙니다. 근거 문서: docs/PRD.md, docs/PRD-v0.2.md, docs/IMPLEMENTATION.md. 설명만으로 업무 차이를 알기 어려운지, 환경 설정과 첫 실행이 부담인지, 체험이 후속 학습 선택에 도움이 되는지는 학생 파일럿에서 확인합니다.`,
);
text(
  s,
  "problem-core",
  "직무 설명을 읽는 것과\n직접 해보는 것 사이에 빈틈이 있어요",
  72,
  170,
  1110,
  150,
  34,
  C.ink,
  true,
);
text(
  s,
  "problem-one",
  "무엇을 바꾸는 일인지",
  72,
  385,
  560,
  62,
  25,
  C.ink,
  true,
);
text(
  s,
  "problem-two",
  "어디서부터 시작할지",
  72,
  462,
  560,
  62,
  25,
  C.ink,
  true,
);
text(
  s,
  "problem-three",
  "다음에 무엇을 배울지",
  72,
  539,
  560,
  62,
  25,
  C.ink,
  true,
);
text(
  s,
  "hypothesis",
  "작은 업무를 직접 해본 경험이\n이 선택에 도움이 되는지 확인해요",
  670,
  411,
  538,
  150,
  24,
  C.secondary,
);
note(s, "기획 가설. 학생 사용 관찰과 전후 응답으로 확인할 예정이에요.");
// 3. Product
s = slide(
  "고르고, 바꾸고, 실행하고, 기록해요",
  `범위: 여섯 코드 직무를 같은 JavaScript로 체험합니다. 프론트엔드, 백엔드, 데이터 분석, AI 엔지니어, 보안 엔지니어, 클라우드/SRE. 본 화면은 docs/screenshots/redesign/after-work.jpg, 합성 QA 자료입니다. 새 체험 2026-11-23.2의 준비된 코드에서 한 줄을 바꾸도록 안내합니다. 직무 전체 재현이나 적성 평가가 아닙니다.`,
);
await shot(s, "docs/screenshots/redesign/after-work.jpg", {
  left: 72,
  top: 151,
  width: 1136,
  height: 468,
});
note(
  s,
  "여섯 직무의 작은 업무를 같은 JavaScript로 체험해요. 화면은 기능 점검용 QA 자료예요.",
);
// 4. exact single line task
s = slide(
  "한 줄로 확인하는 신청 규칙",
  `정확한 새 체험 버전 2026-11-23.2 백엔드 시작 코드입니다. lib/content/2026-11-23.2.ts의 scaffold(backend)와 기준 버전의 solution/tests를 확인했습니다. 변경 전 if (attendees.length > capacity), 변경 후 if (attendees.length >= capacity). 중복 확인은 먼저 유지하며, 정원과 같으면 403과 accepted:false를 반환합니다. 다섯 확인 상황을 실행합니다. 이 예시는 전체 백엔드 업무나 실제 API 서버 배포를 대신하지 않습니다.`,
);
text(
  s,
  "scenario",
  "정원 2명, 이미 신청한 사람 2명, 새 신청 1명",
  72,
  163,
  1136,
  70,
  25,
  C.secondary,
);
text(s, "before-label", "시작 코드", 72, 263, 300, 42, 18, C.secondary);
text(
  s,
  "before-code",
  "if (attendees.length > capacity)",
  72,
  316,
  1136,
  72,
  28,
  C.ink,
  true,
  CODE,
);
text(s, "after-label", "직접 바꾼 코드", 72, 418, 500, 42, 18, C.secondary);
text(
  s,
  "after-code",
  "if (attendees.length >= capacity)",
  72,
  471,
  1136,
  72,
  28,
  C.blue,
  true,
  CODE,
);
text(
  s,
  "outcome",
  "403, accepted: false",
  72,
  575,
  1136,
  58,
  26,
  C.ink,
  true,
  CODE,
);
note(
  s,
  "정원과 같은 경우도 마감으로 처리해요. 수정한 코드는 다섯 상황으로 확인해요.",
);
// 5. bounded tools / reviewed output
s = slide(
  "AI 코치의 근거",
  `코드 근거: lib/coach.ts, lib/coach-routing.ts, lib/coach-guides.ts, docs/AI-QUALITY.md. 최대 3회 요청 안에서 read_mission, inspect_checks를 수행한 뒤 질문 의도를 분류합니다. 서버가 검수된 힌트를 선택하며 모델의 자유 설명은 표시하지 않습니다. 브라우저 실행 보고는 미검증 참고 정보입니다. 보이는 활동은 실제 도구 처리 결과이며 내부 추론이나 가짜 다중 에이전트가 아닙니다. 화면 캡처: docs/screenshots/ai-coach-accuracy.jpg, 이전 버전의 실제 연결 점검 화면이며 학생 응답이 아닙니다.`,
);
text(s, "tool-one", "1  공식 과제 읽기", 72, 181, 730, 60, 27, C.ink, true);
text(
  s,
  "tool-one-detail",
  "read_mission",
  116,
  245,
  600,
  43,
  18,
  C.secondary,
  false,
  CODE,
);
text(
  s,
  "tool-two",
  "2  확인할 입력과 결과 살피기",
  72,
  323,
  730,
  60,
  27,
  C.ink,
  true,
);
text(
  s,
  "tool-two-detail",
  "inspect_checks",
  116,
  387,
  600,
  43,
  18,
  C.secondary,
  false,
  CODE,
);
text(
  s,
  "tool-three",
  "3  근거에 맞는 검수 힌트 선택",
  72,
  465,
  730,
  60,
  27,
  C.ink,
  true,
);
text(
  s,
  "tool-scope",
  "코드를 대신 고치거나 적성을 판정하지 않아요",
  72,
  570,
  740,
  78,
  21,
  C.secondary,
);
await shot(
  s,
  "docs/screenshots/ai-coach-accuracy.jpg",
  { left: 850, top: 174, width: 358, height: 448 },
  { left: 0.763, top: 0.562, right: 0.012, bottom: 0.024 },
);
text(
  s,
  "ai-budget-evidence",
  "AI 일 $1 / 월 $10 앱 추정 예약예산 · Neon 동시성 검증 완료\n공급자 청구 상한 보장 아님. 오른쪽은 이전 버전 연결 점검 화면이에요.",
  72,
  646,
  1136,
  60,
  14,
  C.muted,
);
s.speakerNotes.text +=
  "\n호출 전 추정 비용을 예약하고 사용량으로 정산하는 앱 예산은 일 $1·월 $10입니다. 실제 Neon에서 동시 예약·CAS·정산·정리 검증을 마쳤습니다. 최대 예약액 $0.162144가 남은 예산보다 크면 잔액이 있어도 기본 힌트로 전환할 수 있습니다. 공급자 청구 상한이나 원가 최소를 보장하지 않습니다.";
// 6. Record and evidence
s = slide(
  "체험 기록으로 다음 일을 골라요",
  `코드: lib/lab-state.ts와 lib/next-actions.ts. 코드를 직접 수정하고 실행한 스냅샷과 회고를 연결합니다. 모든 테스트를 통과하지 않아도 회고할 수 있습니다. 흥미·체감 난이도·재도전 의향은 사용자 자기 응답이며 실력이나 적성 점수가 아닙니다. 다음 활동과 선택 이유를 저장하고 확인된 두 직무 회고를 비교합니다. 화면: docs/screenshots/redesign/after-compare.jpg의 합성 QA 응답. 4/5나 3/5는 실제 학생 결과가 아닙니다.`,
);
text(
  s,
  "record-principle",
  "수정한 코드의 실행과 회고를 연결해요",
  72,
  152,
  1136,
  58,
  25,
  C.secondary,
);
await shot(s, "docs/screenshots/redesign/after-compare.jpg", {
  left: 72,
  top: 223,
  width: 1136,
  height: 407,
});
text(
  s,
  "evidence-note",
  "점수와 문장은 합성 QA 자료예요.\n통합 단위 테스트 199개 통과 · 저장·AI 예약예산 동시성 검증 완료",
  72,
  646,
  1136,
  60,
  14,
  C.muted,
);
s.speakerNotes.text +=
  "\n저장 동시성·게임 기록·후속 활동과 AI 추정 예약예산을 통합한 코드에서 단위 테스트 199개를 통과했습니다. 저장 API 검증과 실제 Neon 예산 마이그레이션·동시 예약 CAS·정산·정리 검증을 마쳤습니다. 이 검증은 공급자 청구 상한 보장이나 실제 학생 효과 측정이 아닙니다. 운영 배포 상태는 docs/demo/README.md에서 관리합니다.";
// 7. Editable study result template
s = slide(
  "학생 3명 예비테스트",
  `사용자는 3명 정도 바로 가능하다고 답했지만 실제 관찰·응답은 아직 없습니다. 이 슬라이드는 결과를 채우는 편집 가능한 빈 양식입니다. 먼저 예비테스트를 실시하고 실제 실시/응답 인원을 분모로 기록합니다. 미응답을 실패나 0점으로 채우지 않습니다. 사전·사후 같은 명확성 질문, 다음 행동과 이유 설명, 후속 연락 동의자에 한한 7일 확인을 실시합니다. 정식 12명 파일럿 결과와 섞지 않습니다. 3명으로 제품 효과나 전체 학생을 일반화하지 않습니다. 진행 자료는 docs/PREPILOT.md 및 public의 예비테스트 자료를 최종 통합 후 확인합니다.`,
);
text(
  s,
  "study-status",
  "미실시. 실제 관찰 뒤에 채울 결과 양식이에요",
  72,
  148,
  1136,
  58,
  23,
  C.secondary,
);
const table = s.tables.add({
  rows: 6,
  columns: 2,
  left: 72,
  top: 238,
  width: 1136,
  height: 330,
  columnWidths: [570, 566],
  values: [
    ["확인할 항목", "관찰 기록"],
    ["첫 수정에서 막힌 위치", "실시 후 기록"],
    ["수정·실행·회고 완료", "__명 / 실제 시작 __명"],
    ["사전·사후 명확성 변화", "유효한 응답 쌍 __명"],
    ["다음 행동과 이유 설명", "__명 / 응답 __명"],
    ["7일 뒤 실제 시작 여부", "__명 / 유효 후속 응답 __명"],
  ],
});
table.borders.assign({ style: "solid", fill: C.line, width: 1 });
table.cells.block({ row: 0, column: 0, rowCount: 6, columnCount: 2 }).assign({
  fill: C.white,
  textStyle: { typeface: FONT, fontSize: 26, color: C.ink },
  margins: { left: 16, right: 16, top: 12, bottom: 12 },
  anchor: "middle",
});
table.cells.block({ row: 0, column: 0, rowCount: 1, columnCount: 2 }).assign({
  fill: C.paper,
  textStyle: { typeface: FONT, fontSize: 26, bold: true, color: C.ink },
});
text(
  s,
  "study-next",
  "관찰에서 찾은 막힘을 고친 뒤, 준비한 12명 파일럿으로 이어가요",
  72,
  625,
  1136,
  72,
  22,
  C.ink,
  true,
);
const judgingNotes = [
  "심사 연결: 발표·협업 20점. 제품 목적과 실제 배포 주소를 먼저 보여줍니다. 기획·프론트·백엔드·디자인·발표·사용자 검증 담당은 모두 미정(제안안)입니다. docs/demo/TEAM-ROLES.csv에 실제 배정 후 근거를 채웁니다. AI 에이전트의 병렬 점검은 제작 방법이며 학생 팀원의 역할 실적으로 대신 쓰지 않습니다.",
  "심사 연결: 실용성 25점. 문제는 기획 가설이며 실제 학생 검증을 통해 타당성을 확인합니다.",
  "심사 연결: 창의성 25점. 직무 소개를 읽는 데서 끝나지 않고 작은 업무 수정·실행·회고·다음 활동까지 이어지는 구체 흐름을 보여줍니다.",
  "심사 연결: 기술 완성도 30점. 바뀐 한 줄과 실제 실행 결과를 연결해 설명합니다. 다섯 확인 항목을 정답률·적성 점수로 말하지 않습니다.",
  "심사 연결: 기술 완성도 30점과 창의성 25점. 제한된 도구 루프, 서버 근거 검사, 검수 힌트 선택을 설명합니다. 모델 내부 추론이나 완전 자율 에이전트로 표현하지 않습니다.",
  "심사 연결: 창의성 25점과 실용성 25점. 같은 기록 방식으로 비교하고 사용자가 다음 행동을 고르는 연결을 시연합니다.",
  "심사 연결: 실용성 25점과 발표·협업 20점. 학생 3명 예비테스트의 미실시 상태를 명시하고 실제 관찰 결과·실제 팀 분업 근거를 이후 채웁니다. 자가 점수나 수상 가능성은 계산하지 않습니다.",
];
for (const [i, sl] of p.slides.items.entries())
  sl.speakerNotes.text += "\n\n" + judgingNotes[i];
// Export to private staging, render all slides, then validate the editable PPTX.
for (const [i, sl] of p.slides.items.entries()) {
  const stem = "slide-" + String(i + 1).padStart(2, "0");
  const png = await p.export({ slide: sl, format: "png", scale: 1 });
  await fs.writeFile(
    path.join(out, "previews", stem + ".png"),
    new Uint8Array(await png.arrayBuffer()),
  );
  const layout = await sl.export({ format: "layout" });
  await fs.writeFile(
    path.join(build, stem + ".layout.json"),
    await layout.text(),
  );
}
const candidate = path.join(build, "candidate.pptx");
await (await PresentationFile.exportPptx(p)).save(candidate);
const skill = process.env.PRESENTATIONS_SKILL_DIR;
const final = path.join(
  out,
  process.env.DEMO_PPTX_NAME ?? "haebogi-hackathon-pitch-v5.pptx",
);
if (!skill)
  throw new Error("PRESENTATIONS_SKILL_DIR is required for final validation");
const { finalizePresentation } = await import(
  pathToFileURL(path.join(skill, "container_tools/artifact_tool_utils.mjs"))
    .href
);
const result = await finalizePresentation({
  workspaceDir: root,
  candidatePath: candidate,
  finalPath: final,
  pythonExecutable: process.env.ARTIFACT_PYTHON ?? "python3",
  integrityValidatorPath: path.join(
    skill,
    "container_tools/inspect_presentation_package_integrity.py",
  ),
  layoutValidatorPath: path.join(
    skill,
    "container_tools/inspect_presentation_layout_geometry.py",
  ),
  layoutArgs: [
    "--expected-slide-size-emu",
    "12192000,6858000",
    "--validate-bullet-geometry",
    "--validate-heading-fit",
    "--require-native-table-slide",
    "7",
  ],
  explicitTotalSlideCount: 7,
  requiredNativeTableOwnerSlides: [7],
  requiredNativeChartOwnerSlides: [],
  fontPolicy: { basis: "design", families: [FONT, CODE] },
  verifyArtifactToolImport: true,
  receiptPath: path.join(build, path.basename(final) + ".validation.json"),
});
// The bundled PDF exporter may lack standard font assets. The viewer copy uses
// the same inspected slide renders; all editing remains in the native PPTX.
execFileSync(
  process.env.ARTIFACT_PYTHON ?? "python3",
  [
    path.join(root, "docs/demo/render_pdf.py"),
    path.join(out, "previews"),
    final.replace(/\.pptx$/, ".pdf"),
  ],
  { stdio: "inherit" },
);
console.log(
  JSON.stringify({ slides: p.slides.items.length, output: final, result }),
);
