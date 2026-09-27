import { drawMeshFade } from './fade-mesh.js';

/** Shared treatment for artwork previews, exports and blueprint diagrams. */
export function drawImageFade(ctx, layer, background) {
  if (layer.fadeMesh?.enabled) return drawMeshFade(ctx, layer, background);
  if (layer.fade <= 0) return;
  const { width: w, height: h, fadeDirection: dir } = layer;
  const gradient = ctx.createLinearGradient(
    dir === 'right' ? w : 0,
    dir === 'bottom' ? h : 0,
    dir === 'left' ? w : 0,
    dir === 'top' ? h : 0,
  );
  gradient.addColorStop(0, background);
  gradient.addColorStop(layer.fade, `${background}00`);
  gradient.addColorStop(1, `${background}00`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);
}
