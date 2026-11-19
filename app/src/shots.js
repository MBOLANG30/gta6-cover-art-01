// Fixed scenes for screenshots: ?shot=editor shows the editor with sample photos
// loaded; ?shot=cover shows the cover alone, filling the viewport. Query keys:
// size (square|portrait|wide), layout, grade, photo (pier|boulevard|both|none),
// caption, sub, color, pos. window.__shotReady is set once painted.
import { SIZES, LAYOUTS, GRADES, CAPTION_COLORS, framePhotoForLayout } from './cover.js';

const SAMPLES = { pier: 'samples/pier.jpg', boulevard: 'samples/boulevard.jpg' };

export async function runShot(shot, query, app) {
  const { state, loadImage, placePhoto, redraw } = app;
  if (shot === 'cover') document.body.classList.add('shot-cover');

  if (SIZES[query.get('size')]) state.size = query.get('size');
  if (LAYOUTS[query.get('layout')]) state.layout = query.get('layout');
  if (GRADES[query.get('grade')]) state.grade = query.get('grade');
  if (query.get('caption') !== null) state.caption = query.get('caption');
  if (query.get('sub') !== null) state.subcaption = query.get('sub');
  if (CAPTION_COLORS[query.get('color')]) state.captionColor = query.get('color');
  if (query.get('pos') === 'top' || query.get('pos') === 'bottom') state.captionPosition = query.get('pos');
  state.selected = 0;

  const photo = query.get('photo') ?? 'pier';
  try {
    if (photo === 'both') {
      const hero = await loadImage(SAMPLES.boulevard);
      const side = await loadImage(SAMPLES.pier);
      state.fillAll = false;
      const { w, h } = SIZES[state.size];
      state.panels[0] = { image: hero, name: 'boulevard.jpg', zoom: 1, dx: 0, dy: 0 };
      framePhotoForLayout(state.panels[0], state.layout, w, h, 0);
      for (let i = 1; i < state.panels.length; i++) {
        state.panels[i] = { image: side, name: 'pier.jpg', zoom: 1, dx: 0, dy: 0 };
        framePhotoForLayout(state.panels[i], state.layout, w, h, i);
      }
    } else if (SAMPLES[photo]) {
      const img = await loadImage(SAMPLES[photo]);
      state.fillAll = true;
      placePhoto(img, `${photo}.jpg`);
    }
  } catch {
    // A missing sample still leaves a drawn cover: the placeholder skyline.
  }
  // Keep the editor controls in sync with the scene the shot set up.
  document.dispatchEvent(new CustomEvent('shotready'));
  redraw();
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  window.__shotReady = true;
}
