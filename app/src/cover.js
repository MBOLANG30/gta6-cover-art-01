// Vice Cover Studio — the cover renderer. Draws a multi-panel GTA-style poster
// (hero + side panels, sunset or neon grade, bold Anton caption) onto any canvas
// at any size, from a plain state object. No network, no randomness: the same
// state always draws the same cover, which is what makes exports reproducible.

export const SIZES = {
  square: { label: 'Square 1080 x 1080', w: 1080, h: 1080 },
  portrait: { label: 'Portrait 1080 x 1350', w: 1080, h: 1350 },
  wide: { label: 'Wide 1920 x 1080', w: 1920, h: 1080 },
};

export const LAYOUTS = {
  poster: { label: 'Poster', panels: 3 },
  triptych: { label: 'Triptych', panels: 3 },
  grid: { label: 'Grid', panels: 4 },
  hero: { label: 'Full photo', panels: 1 },
};

export const GRADES = {
  sunset: { label: 'Sunset', top: 'rgba(255,170,60,0.10)', bottom: 'rgba(255,46,136,0.30)' },
  neon: { label: 'Neon night', top: 'rgba(124,58,237,0.26)', bottom: 'rgba(0,210,255,0.20)' },
  dusk: { label: 'Palm dusk', top: 'rgba(255,94,98,0.12)', bottom: 'rgba(43,16,85,0.38)' },
};

export const CAPTION_COLORS = {
  white: '#ffffff',
  yellow: '#ffd23e',
  pink: '#ff5ea8',
  cyan: '#37e6ff',
};

/** A fresh, empty panel slot: no photo yet, cover-fit, centred. */
export function blankPanel() {
  return { image: null, name: '', zoom: 1, dx: 0, dy: 0 };
}

/** The default state: poster layout, sunset grade, square size, empty panels. */
export function defaultState() {
  return {
    size: 'square',
    layout: 'poster',
    grade: 'sunset',
    caption: 'SUNSET HEIST',
    subcaption: 'SUNSET BOULEVARD',
    captionColor: 'white',
    captionPosition: 'bottom',
    captionScale: 1,
    selected: 0,
    fillAll: true,
    panels: [blankPanel(), blankPanel(), blankPanel(), blankPanel()],
  };
}

/** Panel rectangles for a layout inside a cover of w x h, with a gutter. */
export function panelRects(layout, w, h) {
  const g = Math.max(8, Math.round(Math.min(w, h) * 0.012));
  if (layout === 'triptych') {
    const pw = Math.round((w - 2 * g) / 3);
    return [0, 1, 2].map((i) => ({ x: i * (pw + g), y: 0, w: pw, h }));
  }
  if (layout === 'grid') {
    const cw = Math.round((w - g) / 2);
    const ch = Math.round((h - g) / 2);
    return [
      { x: 0, y: 0, w: cw, h: ch },
      { x: cw + g, y: 0, w: w - cw - g, h: ch },
      { x: 0, y: ch + g, w: cw, h: h - ch - g },
      { x: cw + g, y: ch + g, w: w - cw - g, h: h - ch - g },
    ];
  }
  if (layout === 'hero') return [{ x: 0, y: 0, w, h }];
  // poster: one wide hero panel on top, two panels below it.
  const heroH = Math.round((h - g) * 0.62);
  const bw = Math.round((w - g) / 2);
  return [
    { x: 0, y: 0, w, h: heroH },
    { x: 0, y: heroH + g, w: bw, h: h - heroH - g },
    { x: bw + g, y: heroH + g, w: w - bw - g, h: h - heroH - g },
  ];
}

/** Clamps a panel's pan so the photo still covers its whole rectangle. */
function clampPan(panel, rect, imgW, imgH) {
  const base = Math.max(rect.w / imgW, rect.h / imgH);
  const dw = imgW * base * panel.zoom;
  const dh = imgH * base * panel.zoom;
  const maxDx = Math.max(0, (dw - rect.w) / 2 / rect.w);
  const maxDy = Math.max(0, (dh - rect.h) / 2 / rect.h);
  panel.dx = Math.max(-maxDx, Math.min(maxDx, panel.dx));
  panel.dy = Math.max(-maxDy, Math.min(maxDy, panel.dy));
}

/**
 * Frames a freshly placed photo: when a portrait photo is cropped vertically
 * by a wide panel, the centred crop cuts the subject's head off, so bias the
 * crop toward the top of the photo, where a person's face usually is.
 */
export function framePhoto(panel, rect) {
  if (!panel.image) return;
  const iw = panel.image.naturalWidth;
  const ih = panel.image.naturalHeight;
  if (iw / ih >= rect.w / rect.h) return; // cropped sideways, centre is fine
  const base = Math.max(rect.w / iw, rect.h / ih);
  const dh = ih * base * panel.zoom;
  const maxDy = Math.max(0, (dh - rect.h) / 2 / rect.h);
  // Positive dy moves the photo down, revealing its top: the face.
  panel.dy = 0.75 * maxDy;
  panel.dx = 0;
}

/** Frames panel `index` of a layout for a cover of w x h. */
export function framePhotoForLayout(panel, layout, w, h, index) {
  const rects = panelRects(layout, w, h);
  if (rects[index]) framePhoto(panel, rects[index]);
}

/** Draws one photo into one panel, cover-fit, with the panel's zoom and pan. */
function drawPhotoPanel(ctx, panel, rect) {
  const img = panel.image;
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  clampPan(panel, rect, iw, ih);
  const base = Math.max(rect.w / iw, rect.h / ih);
  const dw = iw * base * panel.zoom;
  const dh = ih * base * panel.zoom;
  const x = rect.x + (rect.w - dw) / 2 + panel.dx * rect.w;
  const y = rect.y + (rect.h - dh) / 2 + panel.dy * rect.h;
  ctx.drawImage(img, x, y, dw, dh);
}

// A fixed skyline silhouette for empty panels: same shapes every time.
const SKYLINE = [0.42, 0.6, 0.35, 0.72, 0.5, 0.66, 0.38, 0.58, 0.44, 0.62];

/** Draws a procedural sunset skyline into a panel that has no photo yet. */
function drawPlaceholderPanel(ctx, rect) {
  const sky = ctx.createLinearGradient(0, rect.y, 0, rect.y + rect.h);
  sky.addColorStop(0, '#ff9a3d');
  sky.addColorStop(0.55, '#ff2e88');
  sky.addColorStop(1, '#2b1055');
  ctx.fillStyle = sky;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  // Low sun with a warm glow.
  const cx = rect.x + rect.w * 0.68;
  const cy = rect.y + rect.h * 0.42;
  const r = Math.min(rect.w, rect.h) * 0.16;
  const glow = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r * 2.4);
  glow.addColorStop(0, 'rgba(255, 236, 170, 0.95)');
  glow.addColorStop(0.35, 'rgba(255, 170, 80, 0.45)');
  glow.addColorStop(1, 'rgba(255, 170, 80, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.fillStyle = '#ffe9a8';
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  // Dark building silhouettes along the foot of the panel.
  ctx.fillStyle = '#1c0b33';
  const n = SKYLINE.length;
  const bw = rect.w / n;
  for (let i = 0; i < n; i++) {
    const bh = rect.h * 0.22 * SKYLINE[i];
    ctx.fillRect(rect.x + i * bw, rect.y + rect.h - bh, bw * 0.82, bh);
  }
}

/** Washes one panel with the chosen grade's sunset or neon tint. */
function gradePanel(ctx, grade, rect) {
  const wash = ctx.createLinearGradient(0, rect.y, 0, rect.y + rect.h);
  wash.addColorStop(0, grade.top);
  wash.addColorStop(1, grade.bottom);
  ctx.fillStyle = wash;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
}

/** Fits the caption to the cover width and draws it in bold Anton capitals. */
function drawCaption(ctx, state, w, h) {
  const text = (state.caption || '').trim().toUpperCase();
  const sub = (state.subcaption || '').trim().toUpperCase();
  if (!text && !sub) return;
  const atTop = state.captionPosition === 'top';
  const bandH = h * 0.24;
  const bandY = atTop ? 0 : h - bandH;
  // Dark scrim so the lettering reads over any photo.
  const scrim = ctx.createLinearGradient(0, bandY, 0, bandY + bandH);
  if (atTop) {
    scrim.addColorStop(0, 'rgba(12, 4, 26, 0.88)');
    scrim.addColorStop(1, 'rgba(12, 4, 26, 0)');
  } else {
    scrim.addColorStop(0, 'rgba(12, 4, 26, 0)');
    scrim.addColorStop(1, 'rgba(12, 4, 26, 0.88)');
  }
  ctx.fillStyle = scrim;
  ctx.fillRect(0, bandY, w, bandH);

  const centerY = atTop ? bandY + bandH * 0.55 : bandY + bandH * 0.56;
  ctx.save();
  ctx.translate(w / 2, centerY);
  ctx.rotate(-0.02);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // Measure the caption first: the tag line sits above it, clear of the letters.
  let size = 0;
  if (text) {
    size = Math.round(Math.min(w * 0.115, h * 0.16) * state.captionScale);
    ctx.font = `${size}px Anton, "Arial Narrow", sans-serif`;
    while (ctx.measureText(text).width > w * 0.92 && size > 16) {
      size -= 2;
      ctx.font = `${size}px Anton, "Arial Narrow", sans-serif`;
    }
  }
  if (sub) {
    const subSize = Math.round(h * 0.022);
    ctx.font = `700 ${subSize}px system-ui, sans-serif`;
    try { ctx.letterSpacing = `${Math.round(w * 0.006)}px`; } catch { /* older canvas */ }
    ctx.fillStyle = '#ff5ea8';
    ctx.fillText(sub, 0, -(size / 2 + subSize + h * 0.018));
    try { ctx.letterSpacing = '0px'; } catch { /* older canvas */ }
  }
  if (text) {
    // The tag line above reset the font: set the display face again here.
    ctx.font = `${size}px Anton, "Arial Narrow", sans-serif`;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(12, 4, 26, 0.92)';
    ctx.lineWidth = Math.max(4, size * 0.16);
    ctx.strokeText(text, 0, 0);
    ctx.fillStyle = CAPTION_COLORS[state.captionColor] || '#ffffff';
    ctx.shadowColor = 'rgba(255, 46, 136, 0.55)';
    ctx.shadowBlur = size * 0.18;
    ctx.fillText(text, 0, 0);
    ctx.shadowBlur = 0;
    // Neon accent rule under the caption.
    const tw = ctx.measureText(text).width;
    ctx.fillStyle = '#ff2e88';
    ctx.fillRect(-tw * 0.28, size * 0.55, tw * 0.56, Math.max(3, size * 0.045));
  }
  ctx.restore();
}

/** Draws the whole cover for `state` onto `canvas` at the canvas's own size. */
export function drawCover(canvas, state) {
  const ctx = canvas.getContext('2d');
  const size = SIZES[state.size] || SIZES.square;
  if (canvas.width !== size.w || canvas.height !== size.h) {
    canvas.width = size.w;
    canvas.height = size.h;
  }
  const cw = canvas.width;
  const ch = canvas.height;
  const grade = GRADES[state.grade] || GRADES.sunset;
  const rects = panelRects(state.layout, cw, ch);
  // Deep violet gutters show between the panels.
  ctx.fillStyle = '#150829';
  ctx.fillRect(0, 0, cw, ch);
  rects.forEach((rect, i) => {
    const panel = state.panels[i] || blankPanel();
    ctx.save();
    ctx.beginPath();
    ctx.rect(rect.x, rect.y, rect.w, rect.h);
    ctx.clip();
    if (panel.image) drawPhotoPanel(ctx, panel, rect);
    else drawPlaceholderPanel(ctx, rect);
    gradePanel(ctx, grade, rect);
    ctx.restore();
  });
  // Soft vignette over the whole cover.
  const vig = ctx.createRadialGradient(
    cw / 2, ch / 2, Math.min(cw, ch) * 0.42,
    cw / 2, ch / 2, Math.max(cw, ch) * 0.72,
  );
  vig.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vig.addColorStop(1, 'rgba(10, 2, 24, 0.30)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, cw, ch);
  drawCaption(ctx, state, cw, ch);
}
