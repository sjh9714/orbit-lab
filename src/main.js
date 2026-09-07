import "./style.css";
import "./controls.css";
import "./photo.css";
import { createViewer } from "./viewer.js";
import { downloadGlb, exportModel } from "./export.js";
import { modelDefinitions, createModel } from "./catalog.js";
import { photoDimensions } from './photo.js';

const canvas = document.querySelector("#robot-canvas");
const region = document.querySelector("#viewer-region");
const selector = document.querySelector("#model-selector");
const resetButton = document.querySelector("#reset-view");
const downloadButton = document.querySelector("#download-model");
const downloadLabel = document.querySelector("#download-label");
const downloadStatus = document.querySelector("#download-status");
const loadingState = document.querySelector("#loading-state");
const viewerError = document.querySelector("#viewer-error");
const actionButton = document.querySelector("#action-model");
const actionLabel = document.querySelector("#action-label");
const simulation = document.querySelector('.simulation');
const panel = document.querySelector('#control-panel');
const pauseButton = document.querySelector('#pause-motion');
const modeControl = document.querySelector('#mode-control');
const modeInspect = document.querySelector('#mode-inspect');
const modePhoto = document.querySelector('#mode-photo');
const photoPanel = document.querySelector('.photo-panel');
const photoStatus = document.querySelector('#photo-status');
const savePhotoButton = document.querySelector('#save-photo');
const closePhotoButton = document.querySelector('#close-photo');
const controlGuides = {
  orbit: ['점프', 'WASD / 방향키 이동 · Space 점프'],
  rover: ['브레이크', 'W/S·↑↓ 전후진 · A/D·←→ 선회 · Space 제동'],
  drone: ['상승', 'WASD / 방향키 이동 · Space 상승 · Shift 하강'],
  lander: ['추진 도약', 'WASD / 방향키 낮은 도약 · Space 높은 도약'],
  satellite: ['상승', 'WASD / 방향키 추력 · Space 상승 · Shift 하강'],
};
const rotateButton = document.querySelector("#auto-rotate");
const dependentControls = [
  ...document.querySelectorAll(
    ".simulation button:not(#reload-viewer), .simulation select, .simulation input, #reset-view, #download-model",
  ),
];
let viewer;
let selected = modelDefinitions[0];
let exporting = false;
let graphicsFailed = false;
let state = { playing: false, autoRotate: false, mode: "control", paused: false };

for (const model of modelDefinitions) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "model-card";
  button.dataset.model = model.id;
  button.setAttribute("aria-pressed", String(model === selected));
  button.setAttribute(
    "aria-label",
    `${model.name}-${model.number} ${model.title}`,
  );
  button.disabled = true;
  // Icons and text come only from the local, static model catalog.
  button.innerHTML = `<span class="card-icon"><svg viewBox="0 0 48 48" fill="none" aria-hidden="true">${model.icon}</svg></span><span class="card-copy"><span class="card-name">${model.name}<span class="card-number">–${model.number}</span></span><span class="card-description">${model.shortTitle}</span></span><span class="card-indicator" aria-hidden="true"></span>`;
  button.addEventListener("click", () => { selectModel(model); focusControlCanvas(); });
  selector.append(button);
}

function updateState(next) {
  state = next;
  actionButton.setAttribute("aria-pressed", String(state.playing));
  rotateButton.setAttribute("aria-pressed", String(state.autoRotate));
  actionLabel.textContent = `${selected.actionLabel} ${state.playing ? "멈춤" : "시작"}`;
  simulation.dataset.mode = state.mode;
  region.dataset.mode = state.mode;
  region.dataset.paused = String(state.paused);
  modeControl.setAttribute('aria-pressed', String(state.mode === 'control'));
  modeInspect.setAttribute('aria-pressed', String(state.mode === 'inspect'));
  modePhoto.setAttribute('aria-pressed', String(state.mode === 'photo'));
  photoPanel.hidden = state.mode !== 'photo';
  closePhotoButton.hidden = state.mode !== 'photo';
  if (state.photo) {
    const settings = state.photo;
    const [w, h] = photoDimensions(settings.ratio, settings.longEdge);
    const [ratioWidth, ratioHeight] = settings.ratio.split(':').map(Number);
    simulation.style.setProperty('--photo-ratio', String(ratioWidth / ratioHeight));
    document.querySelector('#photo-size').textContent = `${w} × ${h}`;
    document.querySelector('#photo-preset').value = settings.preset;
    document.querySelector('#studio-preset').value = settings.preset;
    document.querySelector('#photo-resolution').value = settings.longEdge;
    document.querySelector('#photo-exposure').value = settings.exposure;
    document.querySelector('#exposure-value').textContent = `${settings.exposure.toFixed(2)}×`;
    document.querySelectorAll('.photo-options').forEach(group => group.querySelectorAll('button').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.value === settings[group.dataset.setting]))));
    document.querySelectorAll('.photo-panel button, .photo-panel select, .photo-panel input, .mode-bar button, #model-selector button, #reset-view, #download-model').forEach(control => { control.disabled = Boolean(state.capturing) || graphicsFailed || exporting; });
    savePhotoButton.firstChild.textContent = state.capturing ? '촬영 중… ' : 'PNG 저장 ';
  }
  pauseButton.setAttribute('aria-pressed', String(state.paused));
  pauseButton.textContent = state.paused ? '조종 재개' : '일시정지';
  const guide = state.mode === 'control'
    ? `${controlGuides[selected.id][1]}. R로 전체 초기화하세요.`
    : state.mode === 'photo' ? '방향키 또는 드래그로 촬영 시점 회전, R로 전신 구도를 복원하세요.' : '방향키 또는 드래그로 시점 회전, Space로 부품 동작 시작·멈춤, R로 전체 초기화하세요.';
  canvas.setAttribute('aria-label', `${selected.title}. ${guide} 스크롤·핀치 또는 더하기·빼기로 확대·축소하세요.`);
  const motion = state.motion;
  if (motion) {
    const labels = { idle:'탐사 준비', move: selected.id === 'orbit' ? '걷는 중' : '이동 중', crouch:'도약 준비', rise:'상승 중', fall:'하강 중', land:'착지' };
    const status = document.querySelector('#motion-status');
    const statusText = state.paused ? '일시정지' : labels[motion.phase];
    if (status.textContent !== statusText) status.textContent = statusText;
    const altitude = document.querySelector('#altitude');
    altitude.hidden = !['drone','satellite','lander'].includes(selected.id);
    altitude.textContent = `고도 ${motion.position.y.toFixed(1)}m`;
    // The same telemetry used by the UI is available for integration checks.
    for (const axis of ['x','y','z']) region.dataset[axis] = motion.position[axis].toFixed(4);
    region.dataset.heading = motion.heading.toFixed(4);
    region.dataset.speed = motion.speed.toFixed(4);
    region.dataset.time = motion.time.toFixed(4);
    region.dataset.phase = motion.phase;
    region.dataset.grounded = String(motion.grounded);
    document.querySelector('#control-guide').textContent = selected.id === 'drone' && motion.grounded
      ? 'Space·상승 버튼을 누르고 이륙 · WASD 이동 · Shift 하강'
      : controlGuides[selected.id][1];
  }
  updateKeyboardStatus();
}

function focusControlCanvas() {
  if (viewer && state.mode === 'control' && !graphicsFailed && !exporting && !state.capturing)
    canvas.focus({ preventScroll: true });
}

function updateKeyboardStatus() {
  const connected = document.activeElement === canvas && document.hasFocus();
  const status = document.querySelector('#keyboard-status');
  status.dataset.connected = String(connected);
  const text = connected
    ? '키보드 연결됨 · 화면 버튼은 누르고 조종'
    : '키보드 조종: 3D 화면을 클릭하세요 · 화면 버튼은 누르고 조종';
  if (status.textContent !== text) status.textContent = text;
}
document.addEventListener('focusin', updateKeyboardStatus);
document.addEventListener('focusout', updateKeyboardStatus);
window.addEventListener('focus', updateKeyboardStatus);
window.addEventListener('blur', updateKeyboardStatus);

// WebKit does not focus buttons on pointer down by default. Make the focus
// destination explicit so an internal button is not mistaken for window exit
// during canvas blur, interrupting the button's pending click.
simulation.addEventListener('pointerdown', event => {
  const button = event.target.closest('button:not([data-control])');
  if (button && !button.disabled) button.focus({ preventScroll: true });
}, true);

function selectModel(model) {
  if (!viewer || exporting || graphicsFailed) return;
  const previous = selected;
  try {
    const instance = createModel(model.id);
    selected = model;
    viewer.setModel(instance, model.id);
    selector
      .querySelectorAll("button")
      .forEach((button) =>
        button.setAttribute(
          "aria-pressed",
          String(button.dataset.model === model.id),
        ),
      );
    document.querySelector("#model-name").textContent = model.name;
    document.querySelector("#model-number").textContent = model.number;
    document
      .querySelector(".tagline")
      .replaceChildren(
        ...model.tagline.flatMap((line, index) =>
          index
            ? [document.createElement("br"), document.createTextNode(line)]
            : [document.createTextNode(line)],
        ),
      );
    document.querySelector(".description").textContent = model.description;
    document.querySelector("#model-caption").textContent = model.caption;
    document.querySelector(".view-label").textContent =
      `MODEL VIEW / ${model.number}`;
    document.querySelector(".index-number").textContent = model.number;
    document.querySelector(".index-title").textContent = model.title;
    document.querySelector("#model-personality").textContent =
      model.personality;
    document.querySelector("#model-specialty").textContent = model.specialty;
    region.dataset.model = model.id;
    region.setAttribute(
      "aria-label",
      `${model.name}-${model.number} 3D 모델 뷰어`,
    );
    const [action, guide] = controlGuides[model.id];
    document.querySelector('#primary-label').textContent = action;
    document.querySelector('#control-guide').textContent = guide;
    document.querySelector('#secondary-action').hidden = !['drone','satellite'].includes(model.id);
    canvas.setAttribute('aria-label', `${model.title}. ${guide}. 드래그로 시점 회전, 스크롤 또는 더하기·빼기로 확대·축소, R로 전체 초기화하세요.`);
    document.title = `${model.name}–${model.number} · ORBIT LAB`;
    downloadStatus.textContent = "";
    downloadStatus.dataset.error = "false";
    updateState(state);
  } catch (error) {
    selected = previous;
    console.error("Model could not load:", error);
    downloadStatus.dataset.error = "true";
    downloadStatus.textContent =
      "모델을 불러오지 못했어요. 모델을 다시 선택해 주세요.";
  }
}

function showViewerError() {
  graphicsFailed = true;
  loadingState.hidden = true;
  viewerError.hidden = false;
  region.dataset.ready = "false";
  dependentControls.forEach((button) => {
    button.disabled = true;
  });
  selector.querySelectorAll("button").forEach((button) => {
    button.disabled = true;
  });
}
document
  .querySelector("#reload-viewer")
  .addEventListener("click", () => window.location.reload());
modeControl.addEventListener('click', () => { viewer?.setMode('control'); focusControlCanvas(); });
modeInspect.addEventListener('click', () => viewer?.setMode('inspect'));
modePhoto.addEventListener('click', () => { photoStatus.textContent = ''; viewer?.setMode('photo'); });
closePhotoButton.addEventListener('click', () => { viewer?.closePhoto(); modePhoto.focus({ preventScroll: true }); });
for (const id of ['photo-preset', 'studio-preset']) document.querySelector(`#${id}`).addEventListener('change', event => viewer?.setPhotoSettings({ preset: event.target.value }));
document.querySelector('#photo-resolution').addEventListener('change', event => viewer?.setPhotoSettings({ longEdge: Number(event.target.value) }));
document.querySelector('#photo-exposure').addEventListener('input', event => viewer?.setPhotoSettings({ exposure: Number(event.target.value) }));
document.querySelectorAll('.photo-options').forEach(group => group.querySelectorAll('button').forEach(button => button.addEventListener('click', () => viewer?.setPhotoSettings({ [group.dataset.setting]: button.dataset.value }))));
async function savePhoto() {
  if (!viewer || exporting || state.capturing || graphicsFailed) return;
  photoStatus.textContent = '조명과 현재 구도로 사진을 만들고 있어요.';
  photoStatus.dataset.error = 'false';
  document.querySelector('#photo-lower').hidden = true;
  try {
    const { blob, width, height } = await viewer.capturePhoto();
    const name = `${selected.filename.replace('.glb', '')}-${state.photo.preset}-${state.photo.composition}-${width}x${height}.png`;
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = name; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    photoStatus.textContent = `${width} × ${height}px 사진을 저장했어요.`;
  } catch (error) {
    console.error('Photo export failed:', error);
    photoStatus.dataset.error = 'true';
    photoStatus.textContent = '사진을 저장하지 못했어요. 설정은 그대로예요. PNG 저장을 눌러 다시 시도해 주세요.';
    document.querySelector('#photo-lower').hidden = state.photo.longEdge <= 2048;
  }
}
savePhotoButton.addEventListener('click', savePhoto);
document.querySelector('#photo-lower').addEventListener('click', () => { viewer?.setPhotoSettings({ longEdge: 2048 }); savePhoto(); });
pauseButton.addEventListener('click', () => {
  viewer?.setPaused(!state.paused);
  if (!state.paused) focusControlCanvas();
});
resetButton.addEventListener("click", () => { viewer?.resetView(); focusControlCanvas(); });
actionButton.addEventListener("click", () =>
  viewer?.setPlaying(!state.playing),
);
rotateButton.addEventListener("click", () =>
  viewer?.setAutoRotate(!state.autoRotate),
);
document
  .querySelector("#zoom-in")
  .addEventListener("click", () => viewer?.zoom(1));
document
  .querySelector("#zoom-out")
  .addEventListener("click", () => viewer?.zoom(-1));

downloadButton.addEventListener("click", async () => {
  if (!viewer || exporting || graphicsFailed) return;
  exporting = true;
  const filename = selected.filename;
  downloadButton.disabled = true;
  selector.querySelectorAll("button").forEach((button) => {
    button.disabled = true;
  });
  downloadLabel.textContent = "파일 만드는 중";
  downloadStatus.textContent = "";
  downloadStatus.dataset.error = "false";
  try {
    // Exporter snapshots the current visible pose, even when an action is playing.
    const data = await exportModel(viewer.model);
    downloadGlb(data, filename);
    downloadStatus.textContent = `${filename} 파일을 준비했어요.`;
  } catch (error) {
    console.error("GLB export failed:", error);
    downloadStatus.dataset.error = "true";
    downloadStatus.textContent =
      "파일을 만들지 못했어요. GLB 다운로드를 눌러 다시 시도해 주세요.";
  } finally {
    exporting = false;
    downloadButton.disabled = graphicsFailed;
    selector.querySelectorAll("button").forEach((button) => {
      button.disabled = graphicsFailed;
    });
    downloadLabel.textContent = "GLB 다운로드";
    updateState(state);
  }
});

requestAnimationFrame(() => {
  try {
    viewer = createViewer(canvas, showViewerError, updateState, panel);
    selectModel(selected);
    if (!viewer.model) throw new Error("Initial model is unavailable");
    loadingState.hidden = true;
    dependentControls.forEach((button) => {
      button.disabled = false;
    });
    selector.querySelectorAll("button").forEach((button) => {
      button.disabled = false;
    });
    region.dataset.ready = "true";
  } catch (error) {
    console.error("3D viewer could not start:", error);
    viewer?.dispose();
    showViewerError();
  }
});

window.addEventListener("pagehide", (event) => {
  if (!event.persisted) viewer?.dispose();
});
