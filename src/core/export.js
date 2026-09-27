import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import { canvasOf, renderFrame, qualityReport } from './render.js';
import { animationSamples } from './timeline.js';
import { resolveBanner } from '../data/defaults.js';
import { getAsset, putAsset, validateProject } from './storage.js';
import { validateBlueprint } from './schema.js';

export function download(blob, name) {
  const url = URL.createObjectURL(blob),
    a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export const safeName = (value) =>
  String(value)
    .replace(/[^a-z0-9_-]+/gi, '-')
    .slice(0, 90);
const bytes = async (blob) => new Uint8Array(await blob.arrayBuffer());
export async function renderOutput(bp, campaign, resources, format = 'png', progress = () => {}) {
  validateBlueprint(bp);
  const canvas = canvasOf(bp.width, bp.height);
  if (format === 'gif') {
    const { GIFEncoder, quantize, applyPalette } = await import('gifenc');
    const gif = GIFEncoder(),
      samples = animationSamples(bp);
    if (samples.length * bp.width * bp.height > 120_000_000)
      throw new Error(
        'This animation exceeds the browser export budget. Reduce canvas size, duration or moving effects.',
      );
    for (let i = 0; i < samples.length; i++) {
      const { time, delay } = samples[i];
      renderFrame(canvas, bp, campaign, resources, time);
      const data = canvas.getContext('2d').getImageData(0, 0, bp.width, bp.height).data,
        palette = quantize(data, 256);
      gif.writeFrame(applyPalette(data, palette), bp.width, bp.height, {
        palette,
        delay: Math.max(10, Math.round(delay / 10) * 10),
        repeat: bp.repeat,
      });
      progress((i + 1) / samples.length);
      await new Promise((r) => setTimeout(r, 0));
    }
    gif.finish();
    return new Blob([gif.bytes()], { type: 'image/gif' });
  }
  renderFrame(canvas, bp, campaign, resources, 0);
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Canvas encoding failed.'))),
      `image/${format === 'jpg' ? 'jpeg' : format}`,
      0.94,
    ),
  );
}
export async function exportSet(entries, project, campaign, resources, format, onProgress) {
  const files = {},
    manifest = {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      market: entries[0]?.marketId,
      campaign: campaign.name,
      outputs: [],
    };
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i],
      banner = project.banners[entry.id],
      bp = resolveBanner(entry, banner),
      revision = entry.versions.find((v) => v.id === banner?.blueprintVersionId);
    const findings = qualityReport(bp, campaign, resources, entry);
    const draft = revision?.status !== 'published' || findings.length > 0;
    const ext = bp.mode === 'animated' ? 'gif' : format;
    const filename = `${safeName(entry.id)}-${draft ? 'DRAFT-' : ''}v${revision?.number || 1}.${ext}`;
    onProgress(`Rendering ${i + 1} of ${entries.length} · ${bp.width} × ${bp.height}`);
    const blob = await renderOutput(bp, campaign, resources, ext);
    files[filename] = await bytes(blob);
    manifest.outputs.push({
      filename,
      bytes: blob.size,
      width: bp.width,
      height: bp.height,
      blueprintVersionId: banner?.blueprintVersionId,
      overrideRevisionId: banner?.history?.at(-1)?.id || null,
      arranged: Boolean(banner?.arrangement),
      draft,
      findings,
    });
  }
  files['manifest.json'] = strToU8(JSON.stringify(manifest, null, 2));
  return new Blob([zipSync(files, { level: 0 })], { type: 'application/zip' });
}
export async function backupProject(project) {
  const files = { 'project.json': strToU8(JSON.stringify(project, null, 2)) };
  for (const asset of project.assets) {
    const blob = await getAsset(asset.id);
    if (!blob) throw new Error(`Original missing: ${asset.name}`);
    files[`assets/${asset.id}`] = await bytes(blob);
  }
  return new Blob([zipSync(files, { level: 0 })], { type: 'application/zip' });
}
export async function importProject(file) {
  if (file.size > 150 * 1024 * 1024) throw new Error('Project backup exceeds 150 MB.');
  const files = unzipSync(new Uint8Array(await file.arrayBuffer()));
  if (!files['project.json']) throw new Error('This ZIP does not contain project.json.');
  const project = validateProject(JSON.parse(strFromU8(files['project.json'])));
  for (const asset of project.assets) {
    const data = files[`assets/${asset.id}`];
    if (!data) throw new Error(`Missing asset: ${asset.name}`);
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', data)), (b) =>
      b.toString(16).padStart(2, '0'),
    ).join('');
    if (hash !== asset.id) throw new Error(`Asset hash mismatch: ${asset.name}`);
  }
  for (const asset of project.assets)
    await putAsset(asset.id, new Blob([files[`assets/${asset.id}`]], { type: asset.type }));
  return project;
}
