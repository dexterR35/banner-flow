import { digest } from './generation/fingerprint.js';
import { snapshotRecords, validateRecords, restoreRecords } from './generation/store.js';
import { fitText, buttonTextBox } from './text-fit.js';
import { boundText } from './render.js';
import { limitBytes } from '../data/output-limits.js';
import { encodeIndexedPng } from './png-palette.js';
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
  if (!['png', 'jpg', 'webp', 'gif'].includes(format))
    throw new Error('Unsupported export format.');
  const measurement = canvasOf(1, 1).getContext('2d');
  for (const layer of bp.layers.filter(
    (l) => l.fitPolicy === 'strict-v1' && l.visible && ['text', 'button'].includes(l.type),
  )) {
    const fit = fitText(
      measurement,
      boundText(layer, campaign),
      layer.type === 'button' ? buttonTextBox(layer) : layer,
      resources,
    );
    if (fit.overflow)
      throw new Error(
        `${layer.name}: strict text does not fit. Regenerate or adjust its box before export.`,
      );
  }
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
      targets: [],
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
    const target = { id: entry.id, width: bp.width, height: bp.height, state: 'running' };
    manifest.targets.push(target);
    try {
      const { blob, limit } = await renderWithinLimit(
        bp,
        campaign,
        resources,
        ext,
        limitBytes(campaign.outputLimit),
      );
      if (!limit.within) {
        Object.assign(target, {
          state: 'blocked',
          reason: 'ENCODE_LIMIT_EXCEEDED',
          sizeLimit: limit,
        });
        continue;
      }
      files[filename] = await bytes(blob);
      Object.assign(target, { state: 'succeeded', filename });
      manifest.outputs.push({
        filename,
        sizeLimit: limit,
        sha256: await digest(await blob.arrayBuffer()),
        bytes: blob.size,
        width: bp.width,
        height: bp.height,
        blueprintVersionId: banner?.blueprintVersionId,
        overrideRevisionId: banner?.history?.at(-1)?.id || null,
        arranged: Boolean(banner?.arrangement),
        draft,
        findings,
      });
    } catch (error) {
      Object.assign(target, { state: 'failed', reason: error.message });
    }
  }
  files['manifest.json'] = strToU8(JSON.stringify(manifest, null, 2));
  return new Blob([zipSync(files, { level: 0 })], { type: 'application/zip' });
}
export async function backupProject(project) {
  project = structuredClone(project);
  const records = await snapshotRecords(project.assets.map((a) => a.id));
  const files = {
    'project.json': strToU8(JSON.stringify(project, null, 2)),
    'intelligence.json': strToU8(JSON.stringify(records)),
  };
  for (const asset of project.assets) {
    const blob = await getAsset(asset.id);
    if (!blob) throw new Error(`Original missing: ${asset.name}`);
    const source = await bytes(blob);
    if ((await digest(source)) !== asset.id)
      throw new Error(`Original hash mismatch: ${asset.name}`);
    files[`assets/${asset.id}`] = source;
  }
  files['backup-manifest.json'] = strToU8(
    JSON.stringify({
      schemaVersion: 2,
      models: 'Excluded; stored results are portable without model weights.',
      checksums: Object.fromEntries(
        await Promise.all(
          Object.entries(files).map(async ([key, data]) => [key, await digest(data)]),
        ),
      ),
    }),
  );
  return new Blob([zipSync(files, { level: 0 })], { type: 'application/zip' });
}
export async function importProject(file) {
  if (file.size > 150 * 1024 * 1024) throw new Error('Project backup exceeds 150 MB.');
  let expanded = 0,
    count = 0;
  const files = unzipSync(new Uint8Array(await file.arrayBuffer()), {
    filter: (entry) => {
      expanded += entry.originalSize;
      count++;
      if (
        expanded > 300 * 1024 * 1024 ||
        count > 11000 ||
        entry.name.includes('..') ||
        entry.name.startsWith('/') ||
        entry.name.includes('\\')
      )
        throw new Error('Unsafe or oversized backup archive.');
      return true;
    },
  });
  if (files['backup-manifest.json']) {
    const manifest = JSON.parse(strFromU8(files['backup-manifest.json']));
    if (manifest.schemaVersion !== 2 || !manifest.checksums)
      throw new Error('Unsupported backup manifest.');
    for (const [name, hash] of Object.entries(manifest.checksums))
      if (!files[name] || (await digest(files[name])) !== hash)
        throw new Error(`Backup checksum mismatch: ${name}`);
    if (
      !manifest.checksums['project.json'] ||
      (files['intelligence.json'] && !manifest.checksums['intelligence.json'])
    )
      throw new Error('Backup manifest is incomplete.');
  }
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
  const records = files['intelligence.json']
    ? validateRecords(
        JSON.parse(strFromU8(files['intelligence.json'])),
        project.assets.map((a) => a.id),
      )
    : [];
  for (const asset of project.assets)
    await putAsset(asset.id, new Blob([files[`assets/${asset.id}`]], { type: asset.type }));
  await restoreRecords(records);
  return project;
}

/** Finite encoding attempts; dimensions, frame count and required copy never change. */
export async function renderWithinLimit(bp, campaign, resources, format, maxBytes) {
  let blob = await renderOutput(bp, campaign, resources, format);
  const attempts = [{ setting: 'original', bytes: blob.size }];
  if (maxBytes && blob.size > maxBytes) {
    const canvas = canvasOf(bp.width, bp.height);
    renderFrame(canvas, bp, campaign, resources, 0);
    for (const quality of [0.85, 0.7, 0.55, 0.4]) {
      let candidate;
      if (format === 'png') {
        const { quantize, applyPalette } = await import('gifenc');
        const pixels = canvas.getContext('2d').getImageData(0, 0, bp.width, bp.height).data;
        const palette = quantize(pixels, Math.round(quality * 256));
        candidate = encodeIndexedPng(applyPalette(pixels, palette), palette, bp.width, bp.height);
      } else if (format === 'gif') {
        // Preserve timing and palette fidelity: disclose an unmet limit instead of dropping frames.
        candidate = blob;
      } else
        candidate = await new Promise((resolve) =>
          canvas.toBlob(resolve, `image/${format === 'jpg' ? 'jpeg' : format}`, quality),
        );
      if (!candidate) throw new Error('Image encoding failed.');
      attempts.push({ setting: quality, bytes: candidate.size });
      if (candidate.size < blob.size) blob = candidate;
      if (blob.size <= maxBytes) break;
    }
  }
  return { blob, limit: { maxBytes, within: !maxBytes || blob.size <= maxBytes, attempts } };
}
