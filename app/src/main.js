// Vice Cover Studio — wires the editor: photo loading, panel selection and
// drag-to-pan, layout / size / grade / caption controls, and PNG export.
// A `?shot=` query sets up a fixed scene for a screenshot instead (./shots.js).
import { drawCover, defaultState, panelRects, blankPanel, framePhotoForLayout, SIZES, LAYOUTS, GRADES, CAPTION_COLORS } from './cover.js';
import { runShot } from './shots.js';

const state = defaultState();
const canvas = document.getElementById('preview');
const status = document.getElementById('status');
const $ = (id) => document.getElementById(id);

/** Loads an image from a URL, resolving once it can be drawn. */
export function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`could not load ${url}`));
    img.src = url;
  });
}

/** Redraws the live preview, then outlines the selected panel over it. */
function redraw() {
  drawCover(canvas, state);
  // The cover-only shot shows the cover as the app exports it: no editor chrome.
  if (document.body.classList.contains('shot-cover')) return;
  const ctx = canvas.getContext('2d');
  const rects = panelRects(state.layout, canvas.width, canvas.height);
  const rect = rects[state.selected];
  if (!rect) return;
  ctx.save();
  ctx.strokeStyle = '#37e6ff';
  ctx.lineWidth = Math.max(4, canvas.width * 0.006);
  ctx.setLineDash([canvas.width * 0.02, canvas.width * 0.012]);
  ctx.strokeRect(rect.x + 2, rect.y + 2, rect.w - 4, rect.h - 4);
  ctx.setLineDash([]);
  ctx.fillStyle = '#37e6ff';
  const tag = `PANEL ${state.selected + 1}`;
  ctx.font = `700 ${Math.round(canvas.width * 0.02)}px system-ui, sans-serif`;
  const tw = ctx.measureText(tag).width;
  const pad = canvas.width * 0.012;
  ctx.fillRect(rect.x + 4, rect.y + 4, tw + pad * 2, canvas.width * 0.032);
  ctx.fillStyle = '#0b0218';
  ctx.textBaseline = 'middle';
  ctx.fillText(tag, rect.x + 4 + pad, rect.y + 4 + canvas.width * 0.016);
  ctx.restore();
}

/** Puts an image into the selected panel, or into every panel when fill-all is on. */
function placePhoto(img, name) {
  const targets = state.fillAll
    ? panelRects(state.layout, canvas.width, canvas.height).map((_, i) => i)
    : [state.selected];
  for (const i of targets) {
    state.panels[i] = { image: img, name, zoom: 1, dx: 0, dy: 0 };
    framePhotoForLayout(state.panels[i], state.layout, SIZES[state.size].w, SIZES[state.size].h, i);
  }
  redraw();
}

/** Builds one row of toggle buttons from a table of {key: {label}} entries. */
function buildToggles(container, entries, current, onPick) {
  container.innerHTML = '';
  for (const [key, entry] of Object.entries(entries)) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'toggle' + (key === current ? ' on' : '');
    b.textContent = entry.label;
    b.addEventListener('click', () => {
      onPick(key);
      buildToggles(container, entries, key, onPick);
    });
    container.appendChild(b);
  }
}

function refreshToggles() {
  buildToggles($('sizeRow'), SIZES, state.size, (key) => { state.size = key; $('exportBtn').textContent = `Export PNG ${SIZES[key].w} x ${SIZES[key].h}`; redraw(); });
  buildToggles($('layoutRow'), LAYOUTS, state.layout, (key) => { state.layout = key; state.selected = 0; redraw(); });
  buildToggles($('gradeRow'), GRADES, state.grade, (key) => { state.grade = key; redraw(); });
}

function refreshCaptionControls() {
  $('captionInput').value = state.caption;
  $('subInput').value = state.subcaption;
  $('captionSize').value = String(state.captionScale);
  $('captionPos').value = state.captionPosition;
  const row = $('colorRow');
  row.innerHTML = '';
  for (const [key, hex] of Object.entries(CAPTION_COLORS)) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'swatch' + (key === state.captionColor ? ' on' : '');
    b.style.background = hex;
    b.title = key;
    b.setAttribute('aria-label', `Caption colour ${key}`);
    b.addEventListener('click', () => { state.captionColor = key; refreshCaptionControls(); redraw(); });
    row.appendChild(b);
  }
}

// --- Photo loading -----------------------------------------------------------

$('photoInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const img = await loadImage(URL.createObjectURL(file));
    placePhoto(img, file.name);
    status.textContent = `Loaded ${file.name} — drag it into place, then export.`;
  } catch {
    status.textContent = 'That file could not be read as a photo.';
  }
  e.target.value = '';
});

$('fillAll').checked = state.fillAll;
$('fillAll').addEventListener('change', (e) => { state.fillAll = e.target.checked; });

async function loadSample(name) {
  try {
    const img = await loadImage(`samples/${name}.jpg`);
    placePhoto(img, `${name}.jpg`);
    status.textContent = `Sample photo "${name}" loaded.`;
  } catch {
    status.textContent = `Sample photo "${name}" could not be loaded.`;
  }
}
$('sampleBoulevard').addEventListener('click', () => loadSample('boulevard'));
$('samplePier').addEventListener('click', () => loadSample('pier'));
$('fillAllBtn').addEventListener('click', () => {
  const src = state.panels[state.selected];
  if (!src.image) { status.textContent = 'Load a photo into the selected panel first.'; return; }
  for (let i = 0; i < state.panels.length; i++) {
    state.panels[i] = { image: src.image, name: src.name, zoom: 1, dx: 0, dy: 0 };
    framePhotoForLayout(state.panels[i], state.layout, SIZES[state.size].w, SIZES[state.size].h, i);
  }
  redraw();
  status.textContent = 'The selected photo now fills every panel.';
});
$('clearPanel').addEventListener('click', () => {
  state.panels[state.selected] = blankPanel();
  redraw();
});

// --- Panel selection, drag-to-pan, zoom --------------------------------------

function coverPoint(e) {
  const r = canvas.getBoundingClientRect();
  return {
    x: ((e.clientX - r.left) / r.width) * canvas.width,
    y: ((e.clientY - r.top) / r.height) * canvas.height,
  };
}

function panelAt(x, y) {
  const rects = panelRects(state.layout, canvas.width, canvas.height);
  return rects.findIndex((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
}

let drag = null;
canvas.addEventListener('pointerdown', (e) => {
  const p = coverPoint(e);
  const hit = panelAt(p.x, p.y);
  if (hit < 0) return;
  state.selected = hit;
  canvas.setPointerCapture(e.pointerId);
  drag = { x: p.x, y: p.y, moved: false };
  redraw();
});
canvas.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const p = coverPoint(e);
  const panel = state.panels[state.selected];
  const rects = panelRects(state.layout, canvas.width, canvas.height);
  const rect = rects[state.selected];
  if (!panel || !panel.image || !rect) return;
  panel.dx += (p.x - drag.x) / rect.w;
  panel.dy += (p.y - drag.y) / rect.h;
  drag.x = p.x;
  drag.y = p.y;
  drag.moved = true;
  redraw();
});
canvas.addEventListener('pointerup', () => { drag = null; });

$('zoom').addEventListener('input', (e) => {
  state.panels[state.selected].zoom = Number(e.target.value);
  redraw();
});
$('zoomFit').addEventListener('click', () => {
  const panel = state.panels[state.selected];
  panel.zoom = 1;
  panel.dx = 0;
  panel.dy = 0;
  $('zoom').value = '1';
  redraw();
});

// --- Caption controls --------------------------------------------------------

$('captionInput').addEventListener('input', (e) => { state.caption = e.target.value; redraw(); });
$('subInput').addEventListener('input', (e) => { state.subcaption = e.target.value; redraw(); });
$('captionSize').addEventListener('input', (e) => { state.captionScale = Number(e.target.value); redraw(); });
$('captionPos').addEventListener('change', (e) => { state.captionPosition = e.target.value; redraw(); });

// --- Export ------------------------------------------------------------------

/** Renders the cover at its full export size and returns the PNG blob. */
export function exportPng() {
  return new Promise((resolve) => {
    const off = document.createElement('canvas');
    drawCover(off, state);
    off.toBlob((blob) => resolve(blob), 'image/png');
  });
}

$('exportBtn').addEventListener('click', async () => {
  const blob = await exportPng();
  if (!blob) { status.textContent = 'Export failed — try again.'; return; }
  const size = SIZES[state.size];
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `vice-cover-${size.w}x${size.h}.png`;
  a.click();
  status.textContent = `Saved vice-cover-${size.w}x${size.h}.png (${Math.round(blob.size / 1024)} KiB).`;
});

// --- Boot --------------------------------------------------------------------

refreshToggles();
refreshCaptionControls();
$('exportBtn').textContent = `Export PNG ${SIZES[state.size].w} x ${SIZES[state.size].h}`;

// The Anton display font must be in before the first paint, or the caption
// falls back to a narrow sans and the cover looks wrong.
async function boot() {
  try { await document.fonts.load('100px Anton'); } catch { /* fallback font */ }
  const query = new URLSearchParams(location.search);
  if (query.get('shot')) {
    document.addEventListener('shotready', () => {
      refreshToggles();
      refreshCaptionControls();
      $('exportBtn').textContent = `Export PNG ${SIZES[state.size].w} x ${SIZES[state.size].h}`;
    });
    await runShot(query.get('shot'), query, { state, loadImage, placePhoto, redraw });
  } else {
    redraw();
  }
  window.__viceCover = { state, redraw, exportPng, loadImage, loadSample };
}
boot();
