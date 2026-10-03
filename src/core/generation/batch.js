import { fingerprint, canonical, digest } from './fingerprint.js';
import { solveLayout, SOLVER_VERSION, validateStrictScene } from './solver.js';
import { strictPolicy } from './contracts.js';
import { getAsset, loadResources } from '../storage.js';
import { resolveBanner, newEntry, uid } from '../../data/defaults.js';
import { layoutKey } from '../auto-layout.js';
import { renderOutput, safeName } from '../export.js';
import { zipSync, strToU8, unzipSync, strFromU8 } from 'fflate';
import { getRecord, enqueueJob, leaseJob, commitJob, cancelJob, failJob } from './store.js';
import { draftPlan, imagePayload, visionCapabilities } from './planner.js';
import { prepareGeneration } from './prepare.js';

export { STARTER_TARGETS } from '../../data/generation-targets.js';
export function generationSnapshot(project, marketId, targets, policy) {
  if (!project.campaigns[marketId]) throw new Error('Unknown market.');
  if (
    !Array.isArray(targets) ||
    !targets.length ||
    targets.length > 100 ||
    targets.some(
      (t) => ![t.width, t.height].every((n) => Number.isInteger(n) && n >= 32 && n <= 4096),
    ) ||
    new Set(targets.map((t) => `${t.width}x${t.height}`)).size !== targets.length
  )
    throw new Error('Select 1–100 unique sizes between 32 and 4096 pixels.');
  const campaign = structuredClone(project.campaigns[marketId]);
  if (
    ['headline', 'subtitle', 'cta', 'legal'].some((k) => String(campaign[k] || '').length > 20000)
  )
    throw new Error('Copy exceeds the 20,000-character generation budget.');
  const entries = targets.map((t) =>
    project.blueprints.find(
      (e) =>
        e.marketId === marketId &&
        e.versions.find((v) => v.id === e.activeVersionId).blueprint.width === t.width &&
        e.versions.find((v) => v.id === e.activeVersionId).blueprint.height === t.height,
    ),
  );
  return {
    schemaVersion: 1,
    market: structuredClone(project.markets.find((m) => m.id === marketId)),
    campaign,
    policy: strictPolicy(policy),
    targets: targets.map((t, i) => ({
      id: entries[i]?.id || `${marketId}-${t.width}x${t.height}`,
      marketId,
      ...t,
    })),
    bases: entries.map((e) =>
      e ? structuredClone(resolveBanner(e, project.banners[e.id])) : null,
    ),
    blueprintRevisionIds: entries.map((e) => (e ? project.banners[e.id].blueprintVersionId : null)),
    engine: SOLVER_VERSION,
    renderer: 'canvas-1',
  };
}
export function snapshotIsCurrent(snapshot, project) {
  return (
    canonical(snapshot) ===
    canonical(
      generationSnapshot(
        project,
        snapshot.market.id,
        snapshot.targets.map(({ width, height }) => ({ width, height })),
        snapshot.policy,
      ),
    )
  );
}
export async function generateBatch(
  snapshot,
  {
    signal,
    onProgress = () => {},
    brief = '',
    usePlanner = true,
    automaticAnalysis = usePlanner,
  } = {},
) {
  const correction = snapshot.campaign.heroAssetId
    ? await getRecord(`correction:${snapshot.campaign.heroAssetId}`)
    : null;
  let capabilities = null;
  if (usePlanner || automaticAnalysis)
    try {
      capabilities = await visionCapabilities(signal);
    } catch (error) {
      signal?.throwIfAborted();
      capabilities = { qwen: { ready: false, message: error.message } };
    }
  const plannerProfile = capabilities?.qwen?.ready ? capabilities.qwen.profileId : 'unavailable';
  if (automaticAnalysis && !capabilities?.florence?.ready)
    throw new Error(
      capabilities?.florence?.message || 'Florence-2 is required by the Analyze image node.',
    );
  const inputHash = await fingerprint({
    snapshot,
    brief,
    usePlanner,
    automaticAnalysis,
    correction,
    plannerProfile,
    florenceProfile: automaticAnalysis ? capabilities.florence.profileId : null,
  });
  const key = `solve:${inputHash}`;
  await enqueueJob(key, { snapshot, brief, usePlanner, automaticAnalysis }, Date.now(), {
    retryFallback: usePlanner,
  });
  const cached = await getRecord('ledger');
  if (cached?.jobs[key]?.state === 'succeeded') return { ...cached.jobs[key].result, cached: true };
  const owner = crypto.randomUUID(),
    lease = await leaseJob(key, owner, Date.now(), 1800000);
  if (!lease)
    throw new Error('This generation is already running in another tab. Retry after it finishes.');
  const cancel = () => cancelJob(key);
  signal?.addEventListener('abort', cancel, { once: true });
  const batch = {
    schemaVersion: 1,
    id: await fingerprint({ inputHash, revision: lease.token }),
    inputHash,
    snapshot,
    createdAt: new Date().toISOString(),
    status: 'running',
    items: [],
    planner: null,
  };
  try {
    signal?.throwIfAborted();
    const resources = await loadResources(snapshot.campaign),
      context = document.createElement('canvas').getContext('2d');
    let policy = snapshot.policy;
    // Corrections are captured and fingerprinted separately from immutable original bytes.
    batch.correction = correction ? structuredClone(correction) : null;
    batch.analysis = await prepareGeneration(snapshot.campaign, correction, {
      signal,
      onProgress,
      automatic: automaticAnalysis,
      capabilities,
    });
    if (usePlanner && snapshot.campaign.heroAssetId) {
      onProgress('Planning allowed layouts…');
      try {
        if (!capabilities.qwen?.ready)
          throw new Error(
            capabilities.qwen?.message || 'Qwen is unavailable; using authored layouts.',
          );
        const planContext = {
          brief,
          briefRevisionId: await fingerprint({ brief }),
          copyRevisionId: await fingerprint(snapshot.campaign),
          copy: Object.fromEntries(
            ['headline', 'subtitle', 'cta', 'legal'].map((k) => [k, snapshot.campaign[k]]),
          ),
          assetIds: [snapshot.campaign.heroAssetId, snapshot.campaign.logoAssetId].filter(Boolean),
          roleBindings: {
            hero: snapshot.campaign.heroAssetId,
            ...(snapshot.campaign.logoAssetId ? { logo: snapshot.campaign.logoAssetId } : {}),
          },
          variants: policy.variants,
          targets: snapshot.targets.map(({ id, width, height }) => ({ id, width, height })),
          source: { width: resources.hero.width, height: resources.hero.height },
          focus: batch.analysis.focus,
          visual: batch.analysis.observations.visual?.visual,
          ocr: batch.analysis.observations.florence?.ocr?.slice(0, 20),
          blueprints: snapshot.bases.flatMap((base, index) => {
            const revisionId = snapshot.blueprintRevisionIds[index];
            if (
              !base ||
              !revisionId ||
              base.mode !== 'static' ||
              index >= 4 ||
              base.layers.length > 20
            )
              return [];
            return [
              {
                targetId: snapshot.targets[index].id,
                revisionId,
                width: base.width,
                height: base.height,
                mode: base.mode,
                layers: base.layers.map(({ id, source, type, x, y, width, height, locks }) => ({
                  id,
                  source,
                  type,
                  x,
                  y,
                  width,
                  height,
                  locks: locks || [],
                })),
              },
            ];
          }),
          targetPresetIds: snapshot.targets.map((t) => t.id),
          styleTokenSetId: `${snapshot.market.id}-draft`,
          familyId: 'campaign-hero',
        };
        batch.planner = await draftPlan(
          planContext,
          await imagePayload(await getAsset(snapshot.campaign.heroAssetId)),
          { signal, profileId: capabilities.qwen.profileId },
        );
        // The planner ranks candidates; validation still explores every permitted fallback.
      } catch (error) {
        signal?.throwIfAborted();
        batch.planner = { fallback: true, reason: error.message };
      }
    }
    for (let i = 0; i < snapshot.targets.length; i++) {
      signal?.throwIfAborted();
      onProgress(`Solving ${i + 1} of ${snapshot.targets.length}…`);
      const target = snapshot.targets[i];
      try {
        const result = solveLayout(
          {
            target,
            base: snapshot.bases[i],
            campaign: snapshot.campaign,
            policy,
            focus: batch.analysis.focus,
            keepBoxes: policy.preserveBoxes,
            variantPriority: batch.planner?.plan?.variantPriority,
            blueprintEdit: batch.planner?.plan?.blueprintEdits?.find(
              (edit) => edit.targetId === target.id,
            ),
          },
          { context, resources, signal },
        );
        result.layoutInputHash = await fingerprint({
          snapshot,
          inputHash,
          target,
          correction: batch.correction,
          analysis: batch.analysis,
          planner: batch.planner,
          policy,
        });
        result.state = result.technicalStatus === 'valid' ? 'succeeded' : 'blocked';
        batch.items.push(result);
      } catch (error) {
        if (signal?.aborted) throw error;
        batch.items.push({ target, state: 'failed', message: error.message });
      }
      await new Promise((r) => setTimeout(r, 0));
    }
    batch.status = batch.items.every((i) => i.state === 'succeeded')
      ? 'completed'
      : batch.items.some((i) => i.state === 'succeeded')
        ? 'partially_completed'
        : 'failed';
    if (!(await commitJob(key, owner, lease.token, batch)))
      throw new Error('Generation was cancelled or its lease expired.');
    return batch;
  } catch (error) {
    if (signal?.aborted) {
      for (const target of snapshot.targets.slice(batch.items.length))
        batch.items.push({ target, state: 'cancelled' });
      batch.status = 'cancelled';
      return batch;
    }
    await failJob(key, owner, lease.token, error.message);
    throw error;
  } finally {
    signal?.removeEventListener('abort', cancel);
  }
}
export async function assertBatchCorrectionsCurrent(batch) {
  const current = batch.snapshot.campaign.heroAssetId
    ? await getRecord(`correction:${batch.snapshot.campaign.heroAssetId}`)
    : null;
  if (canonical(current || null) !== canonical(batch.correction || null))
    throw new Error('Asset corrections changed. Generate again before accepting these drafts.');
}
export function acceptBatch(project, batch) {
  if (!snapshotIsCurrent(batch.snapshot, project))
    throw new Error('Inputs changed. Generate again before accepting this batch.');
  const next = structuredClone(project),
    accepted = [];
  for (const item of batch.items.filter((i) => i.state === 'succeeded')) {
    const bp = structuredClone(item.scene),
      old = next.banners[bp.id];
    for (const layer of bp.layers)
      if (['text', 'button'].includes(layer.type)) {
        const measured = item.report.measurements[layer.id];
        if (measured) layer.textOverride = measured.sourceText;
      }
    let entry = next.blueprints.find((e) => e.id === bp.id);
    if (!entry) {
      entry = newEntry(bp);
      next.blueprints.push(entry);
      next.banners[bp.id] = {
        blueprintVersionId: entry.activeVersionId,
        override: null,
        history: [],
      };
    }
    const current = next.banners[bp.id];
    const before = resolveBanner(entry, current);
    next.banners[bp.id] = {
      ...current,
      override: bp,
      arrangement: null,
      layoutKey: layoutKey(next.campaigns[bp.marketId]),
      history: [
        ...current.history,
        { id: uid(), createdAt: new Date().toISOString(), blueprint: before },
        { id: uid(), createdAt: new Date().toISOString(), blueprint: bp },
      ],
      generation: {
        batchId: batch.id,
        layoutInputHash: item.layoutInputHash,
        variant: item.variant,
      },
    };
    accepted.push({
      id: bp.id,
      before: old || null,
      after: structuredClone(next.banners[bp.id]),
      newEntry: !old,
    });
  }
  next.generationUndo = { batchId: batch.id, marketId: batch.snapshot.market.id, accepted };
  return next;
}
export function undoBatch(project) {
  const undo = project.generationUndo;
  if (!undo) return project;
  if (undo.accepted.some((item) => canonical(project.banners[item.id]) !== canonical(item.after)))
    throw new Error('A generated banner was edited. Use its editor undo to preserve newer work.');
  const next = structuredClone(project);
  for (const item of undo.accepted) {
    if (item.before) next.banners[item.id] = item.before;
    else {
      delete next.banners[item.id];
      next.blueprints = next.blueprints.filter((e) => e.id !== item.id);
    }
  }
  delete next.generationUndo;
  return next;
}
export async function exportBatch(batch, { signal, onProgress = () => {}, maxBytes = null } = {}) {
  const files = {},
    manifest = {
      schemaVersion: 2,
      batchId: batch.id,
      inputHash: batch.inputHash,
      market: batch.snapshot.market.id,
      locale: batch.snapshot.market.locale,
      createdAt: new Date().toISOString(),
      reviewStatus: 'draft',
      engine: SOLVER_VERSION,
      renderer: 'canvas-1',
      encoder: 'browser-png',
      assets: Object.fromEntries(
        ['hero', 'logo', 'font'].map((k) => [k, batch.snapshot.campaign[`${k}AssetId`] || null]),
      ),
      targets: [],
    };
  const resources = await loadResources(batch.snapshot.campaign),
    context = document.createElement('canvas').getContext('2d');
  for (const item of batch.items) {
    const record = {
      target: item.target,
      state: item.state,
      variant: item.variant || null,
      layoutInputHash: item.layoutInputHash || null,
      findings: item.report?.hardViolations || [],
      reviewStatus: 'draft',
    };
    manifest.targets.push(record);
    if (signal?.aborted) {
      record.state = 'cancelled';
      continue;
    }
    if (item.state !== 'succeeded') continue;
    try {
      onProgress(`Exporting ${item.target.width} × ${item.target.height}…`);
      const qa = validateStrictScene(
        item.scene,
        batch.snapshot.campaign,
        resources,
        batch.snapshot.policy,
        context,
        {
          focus:
            batch.analysis?.focus ||
            batch.correction?.value?.focal ||
            batch.snapshot.campaign.subjectFocus?.box,
        },
      );
      if (qa.hardViolations.length) {
        record.state = 'blocked';
        record.findings = qa.hardViolations;
        continue;
      }
      const blob = await renderOutput(item.scene, batch.snapshot.campaign, resources, 'png');
      if (maxBytes && blob.size > maxBytes) {
        record.state = 'blocked';
        record.findings = [
          { code: 'ENCODE_LIMIT_EXCEEDED', message: `${blob.size} bytes exceeds ${maxBytes}.` },
        ];
        continue;
      }
      const decoded = await createImageBitmap(blob);
      const matches = decoded.width === item.target.width && decoded.height === item.target.height;
      decoded.close();
      if (!matches) throw new Error('Encoded dimensions differ from the requested target.');
      const bytes = new Uint8Array(await blob.arrayBuffer());
      record.filename = `${safeName(batch.snapshot.market.id)}-${item.target.width}x${item.target.height}-${safeName(item.variant)}-DRAFT-${batch.id.slice(0, 8)}.png`;
      Object.assign(record, {
        state: 'succeeded',
        bytes: bytes.length,
        sha256: await digest(bytes),
        dimensionsVerified: true,
      });
      files[record.filename] = bytes;
    } catch (error) {
      record.state = 'failed';
      record.findings = [{ code: 'EXPORT_FAILED', message: error.message }];
    }
  }
  manifest.counts = Object.fromEntries(
    ['succeeded', 'blocked', 'failed', 'cancelled'].map((s) => [
      s,
      manifest.targets.filter((t) => t.state === s).length,
    ]),
  );
  files['manifest.json'] = strToU8(JSON.stringify(manifest, null, 2));
  return new Blob([zipSync(files, { level: 0 })], { type: 'application/zip' });
}

/** Combine frozen market batches without silently omitting any target. */
export async function exportMatrix(batches, options = {}) {
  const files = {},
    manifest = { schemaVersion: 2, reviewStatus: 'draft', batches: [], targets: [] };
  for (const batch of batches) {
    const archive = unzipSync(
      new Uint8Array(await (await exportBatch(batch, options)).arrayBuffer()),
    );
    const report = JSON.parse(strFromU8(archive['manifest.json']));
    manifest.batches.push({
      id: batch.id,
      inputHash: batch.inputHash,
      market: report.market,
      locale: report.locale,
    });
    manifest.targets.push(
      ...report.targets.map((t) => ({ ...t, market: report.market, batchId: batch.id })),
    );
    for (const [name, data] of Object.entries(archive))
      if (name !== 'manifest.json') files[name] = data;
  }
  manifest.counts = Object.fromEntries(
    ['succeeded', 'blocked', 'failed', 'cancelled'].map((s) => [
      s,
      manifest.targets.filter((t) => t.state === s).length,
    ]),
  );
  files['manifest.json'] = strToU8(JSON.stringify(manifest, null, 2));
  return new Blob([zipSync(files, { level: 0 })], { type: 'application/zip' });
}
