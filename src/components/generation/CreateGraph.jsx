import { memo, useEffect, useRef, useState } from 'react';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Handle,
  Position,
  applyNodeChanges,
  applyEdgeChanges,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  Image,
  Type,
  ScanSearch,
  Sparkles,
  LayoutTemplate,
  MonitorPlay,
  Play,
  Check,
  Download,
  Undo2,
  X,
} from 'lucide-react';
import BannerPreview from '../banner/BannerPreview.jsx';
import { useResources } from '../../hooks/useProject.js';
import { canConnect, edgeId, PORTS } from '../../core/generation/flow.js';
import { STARTER_TARGETS } from '../../data/generation-targets.js';
import { snapshotIsCurrent } from '../../core/generation/batch.js';
import { VARIANTS } from '../../core/generation/contracts.js';
import { resolveBanner } from '../../data/defaults.js';

const icons = {
  image: Image,
  copy: Type,
  analysis: ScanSearch,
  planner: Sparkles,
  compose: LayoutTemplate,
  output: MonitorPlay,
};
const names = {
  image: 'Campaign image',
  copy: 'Campaign copy',
  analysis: 'Analyze image',
  planner: 'Qwen planner',
  compose: 'Compose layouts',
  output: 'Format output',
};
function OutputPreview({ item, campaign }) {
  const { resources } = useResources(campaign);
  if (!item?.scene || !resources) return null;
  return (
    <div className="create-node-preview">
      <BannerPreview blueprint={item.scene} campaign={campaign} resources={resources} />
    </div>
  );
}
function SourceThumbnail({ image }) {
  const canvas = useRef(null);
  useEffect(() => {
    if (!image || !canvas.current) return;
    const context = canvas.current.getContext('2d');
    const scale = Math.max(54 / image.naturalWidth, 45 / image.naturalHeight);
    const width = image.naturalWidth * scale;
    const height = image.naturalHeight * scale;
    context.drawImage(image, (54 - width) / 2, (45 - height) / 2, width, height);
  }, [image]);
  return <canvas ref={canvas} width={54} height={45} aria-label="Current campaign source" />;
}
function BlueprintMap({ blueprint, label }) {
  if (!blueprint)
    return <div className="create-blueprint-empty">No saved Blueprint for this size</div>;
  const color = {
    image: '#5aa3c3',
    logo: '#c9e879',
    text: '#f1e6c9',
    button: '#08cd57',
    shape: '#89909a',
  };
  return (
    <div className="create-blueprint-map">
      <span>{label}</span>
      <svg
        viewBox={`0 0 ${blueprint.width} ${blueprint.height}`}
        role="img"
        aria-label={`${label} ${blueprint.width} by ${blueprint.height} Blueprint layout`}
      >
        <rect
          width={blueprint.width}
          height={blueprint.height}
          fill={blueprint.background || '#141820'}
        />
        {blueprint.layers
          .filter((layer) => layer.visible !== false)
          .map((layer) => (
            <rect
              key={layer.id}
              x={layer.x}
              y={layer.y}
              width={layer.width}
              height={layer.height}
              fill={color[layer.type] || '#89909a'}
              fillOpacity="0.32"
              stroke={color[layer.type] || '#89909a'}
              strokeWidth={Math.max(1, Math.min(blueprint.width, blueprint.height) / 150)}
            >
              <title>{layer.name || layer.id}</title>
            </rect>
          ))}
      </svg>
    </div>
  );
}
function NodeAction({ label, shortLabel, onClick, icon: Icon, primary = false, disabled = false }) {
  return (
    <button
      type="button"
      className={`create-node-action nodrag nowheel ${primary ? 'create-node-action-primary' : ''}`}
      aria-label={label}
      title={label}
      disabled={disabled}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
    >
      <Icon size={13} />
      <span>{shortLabel || label}</span>
    </button>
  );
}
const CreateNode = memo(function CreateNode({ data }) {
  const [blueprintId, setBlueprintId] = useState('');
  const Icon = icons[data.kind];
  const inputs = Object.entries(PORTS[data.kind].inputs);
  const outputs = Object.entries(PORTS[data.kind].outputs);
  const blueprintView =
    data.blueprintViews?.find((view) => view.id === blueprintId) || data.blueprintViews?.[0];
  return (
    <article
      className={`create-node create-node-${data.kind} ${data.status ? `create-node-${data.status}` : ''}`}
      aria-label={`${data.title || names[data.kind]} node`}
    >
      <header>
        <span className="create-node-icon">
          <Icon size={16} />
        </span>
        <strong>{data.title || names[data.kind]}</strong>
        <span className="create-node-tag">
          {data.kind === 'output' ? data.status || 'draft' : data.kind}
        </span>
      </header>
      <div
        className="create-node-content nodrag nowheel"
        onWheel={(event) => event.stopPropagation()}
      >
        {data.kind === 'image' && (
          <div className="create-node-body">
            {data.image && <SourceThumbnail image={data.image} />}
            <div>
              <span>{data.image ? 'Original image linked' : 'Choose an image'}</span>
              <label className="create-node-upload nodrag nowheel">
                {data.image ? 'Replace image' : 'Upload image'}
                <input
                  type="file"
                  aria-label="Upload campaign image from node"
                  accept="image/png,image/jpeg,image/webp"
                  disabled={data.disabled}
                  onPointerDown={(event) => event.stopPropagation()}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) data.uploadImage(file);
                    event.target.value = '';
                  }}
                />
              </label>
            </div>
          </div>
        )}
        {data.kind === 'copy' && (
          <div className="create-node-copy">
            {['headline', 'subtitle', 'cta', 'legal'].map((field) => (
              <label className="create-node-field" key={field}>
                <span>{field}</span>
                <input
                  className="create-node-input nodrag nowheel"
                  aria-label={`${data.marketName} ${field}`}
                  value={data.campaign?.[field] || ''}
                  disabled={data.disabled}
                  onPointerDown={(event) => event.stopPropagation()}
                  onChange={(event) => data.changeCampaign({ [field]: event.target.value })}
                />
              </label>
            ))}
            <label className="create-node-field">
              <span>Creative brief</span>
              <input
                className="create-node-input nodrag nowheel"
                aria-label="Creative brief in copy node"
                placeholder="Describe the composition"
                value={data.brief || ''}
                disabled={data.disabled}
                onPointerDown={(event) => event.stopPropagation()}
                onChange={(event) => data.updateData({ brief: event.target.value })}
              />
            </label>
          </div>
        )}
        {data.kind === 'analysis' && (
          <>
            <p>Florence-2 · text and object regions</p>
            <p>{data.florenceStatus}</p>
            {data.batch?.analysis && (
              <p>
                {data.batch.analysis.observations.florence?.ocr?.length || 0} text regions,{' '}
                {data.batch.analysis.observations.florence?.provenance?.objects?.length || 0} object
                regions. Subject placement: {data.batch.analysis.focusSource.replaceAll('-', ' ')}.{' '}
                {data.batch.analysis.notices.join(' ')}
              </p>
            )}
          </>
        )}
        {data.kind === 'planner' && (
          <>
            <label
              className="create-node-toggle nodrag nowheel"
              onPointerDown={(event) => event.stopPropagation()}
            >
              <input
                aria-label="Use Qwen planner"
                type="checkbox"
                checked={data.enabled !== false}
                disabled={data.disabled}
                onChange={(event) => data.updateData({ enabled: event.target.checked })}
              />
              <span>
                {data.enabled === false
                  ? 'Qwen bypassed'
                  : data.modelStatus.startsWith('Ready')
                    ? 'Qwen ready'
                    : 'Offline · authored fallback'}
              </span>
            </label>
            <p>{data.modelStatus}</p>
            {data.batch?.planner?.fallback && (
              <p>Qwen unavailable: {data.batch.planner.reason} Authored layouts were used.</p>
            )}
            {data.batch?.planner?.plan && (
              <p>Planned with Qwen · {data.batch.planner.plan.explanation}</p>
            )}
            {data.blueprintViews?.length > 0 && (
              <div className="create-blueprint-review nodrag nowheel">
                <label>
                  Blueprint for format
                  <select
                    aria-label="Blueprint shown in Qwen node"
                    value={blueprintView.id}
                    onPointerDown={(event) => event.stopPropagation()}
                    onChange={(event) => setBlueprintId(event.target.value)}
                  >
                    {data.blueprintViews.map((view) => (
                      <option key={view.id} value={view.id}>
                        {view.width} × {view.height}
                      </option>
                    ))}
                  </select>
                </label>
                <small>
                  {blueprintView.saved
                    ? `Saved default · ${blueprintView.revisionId.slice(0, 8)}`
                    : 'No saved default · authored layout'}
                </small>
                <div className="create-blueprint-comparison">
                  <BlueprintMap
                    blueprint={blueprintView.source}
                    label={blueprintView.hasOverride ? 'Banner starting layout' : 'Saved default'}
                  />
                  {blueprintView.draft?.scene && (
                    <BlueprintMap
                      blueprint={blueprintView.draft.scene}
                      label={
                        blueprintView.draft.candidateId === 'qwen-blueprint'
                          ? 'Qwen draft'
                          : 'Generated draft'
                      }
                    />
                  )}
                </div>
                {blueprintView.draft && (
                  <small>
                    Selected:{' '}
                    {blueprintView.draft.variant?.replaceAll('-', ' ') || blueprintView.draft.state}
                    . Saved default unchanged.
                  </small>
                )}
                {blueprintView.draft &&
                  data.batch?.planner?.plan?.blueprintEdits?.some(
                    (edit) => edit.targetId === blueprintView.draft.target.id,
                  ) &&
                  blueprintView.draft.candidateId !== 'qwen-blueprint' && (
                    <small>
                      Qwen proposed a Blueprint edit; strict checks selected another layout.
                    </small>
                  )}
              </div>
            )}
          </>
        )}
        {data.kind === 'compose' && (
          <div
            className="create-node-compose-settings nodrag nowheel"
            onPointerDown={(event) => event.stopPropagation()}
          >
            <label>
              <input
                type="checkbox"
                aria-label="Fit all layouts"
                checked={!data.manualLayouts}
                disabled={data.disabled}
                onChange={(event) => data.updateData({ manualLayouts: !event.target.checked })}
              />
              Fit all layouts
            </label>
            {data.manualLayouts && (
              <div className="create-node-variants">
                {VARIANTS.map((variant) => (
                  <label key={variant}>
                    <input
                      type="checkbox"
                      checked={data.policy?.variants?.includes(variant) || false}
                      disabled={data.disabled}
                      onChange={(event) => {
                        const variants = event.target.checked
                          ? [...new Set([...(data.policy?.variants || []), variant])]
                          : data.policy.variants.filter((entry) => entry !== variant);
                        if (variants.length)
                          data.updateData({ policy: { ...data.policy, variants } });
                      }}
                    />
                    {variant.replaceAll('-', ' ')}
                  </label>
                ))}
              </div>
            )}
            <label>
              Min text
              <input
                type="number"
                min="6"
                max="100"
                value={data.minimumFont || 14}
                disabled={data.disabled}
                onChange={(event) =>
                  data.updateData({
                    policy: {
                      ...data.policy,
                      minimumFont: Math.max(6, Math.min(100, Number(event.target.value) || 14)),
                    },
                  })
                }
              />
            </label>
            <label>
              Min legal
              <input
                type="number"
                min="6"
                max="100"
                value={data.policy?.minimumLegal || 9}
                disabled={data.disabled}
                onChange={(event) =>
                  data.updateData({
                    policy: {
                      ...data.policy,
                      minimumLegal: Math.max(6, Math.min(100, Number(event.target.value) || 9)),
                    },
                  })
                }
              />
            </label>
            <label>
              <input
                type="checkbox"
                checked={Boolean(data.policy?.requireFont)}
                disabled={data.disabled}
                onChange={(event) =>
                  data.updateData({
                    policy: {
                      ...data.policy,
                      requireFont: event.target.checked,
                      requiredRoles: event.target.checked
                        ? ['hero', 'logo', 'headline', 'cta']
                        : ['hero', 'headline', 'cta'],
                    },
                  })
                }
              />{' '}
              Require logo and font
            </label>
            <label>
              <input
                type="checkbox"
                checked={Boolean(data.policy?.preserveBoxes)}
                disabled={data.disabled}
                onChange={(event) =>
                  data.updateData({
                    policy: { ...data.policy, preserveBoxes: event.target.checked },
                  })
                }
              />{' '}
              Preserve blueprint boxes
            </label>
            <label>
              <input
                type="checkbox"
                checked={Boolean(data.policy?.allowContain)}
                disabled={data.disabled}
                onChange={(event) =>
                  data.updateData({
                    policy: { ...data.policy, allowContain: event.target.checked },
                  })
                }
              />{' '}
              Allow whole image
            </label>
            {data.batches.length > 0 && (
              <>
                <p>
                  {data.batches
                    .map(
                      (batch) =>
                        `${batch.snapshot.market.name}: ${batch.items.filter((item) => item.state === 'succeeded').length} of ${batch.items.length} layouts fit`,
                    )
                    .join(' · ')}
                </p>
                <div className="create-node-batch-actions">
                  <NodeAction
                    label="Use valid drafts in Studio"
                    icon={Check}
                    disabled={
                      data.disabled ||
                      !data.batches.some((batch) =>
                        batch.items.some((item) => item.state === 'succeeded'),
                      ) ||
                      data.batches.some((batch) => !snapshotIsCurrent(batch.snapshot, data.project))
                    }
                    onClick={data.acceptAll}
                  />
                  <NodeAction
                    label="Export generated drafts"
                    icon={Download}
                    disabled={data.disabled}
                    onClick={data.exportDrafts}
                  />
                  {data.batches.length > 1 && (
                    <NodeAction
                      label="Export entire market matrix"
                      icon={Download}
                      disabled={data.disabled}
                      onClick={data.exportMatrix}
                    />
                  )}
                </div>
              </>
            )}
            {data.canUndo && (
              <NodeAction
                label="Undo generation"
                icon={Undo2}
                disabled={data.disabled}
                onClick={data.undoGeneration}
              />
            )}
            {data.busy && (
              <NodeAction label="Cancel generation" icon={X} onClick={data.cancelGeneration} />
            )}
          </div>
        )}
        {data.kind === 'output' && (
          <>
            <div
              className="create-node-output-settings nodrag nowheel"
              onPointerDown={(event) => event.stopPropagation()}
            >
              <select
                aria-label={`Market for ${data.title}`}
                value={data.marketId}
                disabled={data.disabled}
                onChange={(event) => data.updateData({ marketId: event.target.value })}
              >
                {data.markets.map((market) => (
                  <option key={market.id} value={market.id}>
                    {market.name}
                  </option>
                ))}
              </select>
              <select
                aria-label={`Size for ${data.title}`}
                value={`${data.width}x${data.height}`}
                disabled={data.disabled}
                onChange={(event) => {
                  const [width, height] = event.target.value.split('x').map(Number);
                  data.updateData({ width, height });
                }}
              >
                {data.sizes.map((size) => (
                  <option key={size} value={size}>
                    {size.replace('x', ' × ')}
                  </option>
                ))}
              </select>
            </div>
            <div
              className="create-node-dimensions nodrag nowheel"
              onPointerDown={(event) => event.stopPropagation()}
            >
              <label>
                W
                <input
                  key={`${data.title}-width`}
                  aria-label="Custom width"
                  type="number"
                  min="32"
                  max="4096"
                  defaultValue={data.width}
                  disabled={data.disabled}
                  onBlur={(event) =>
                    data.updateData({
                      width: Math.max(32, Math.min(4096, Number(event.target.value) || data.width)),
                    })
                  }
                />
              </label>
              <label>
                H
                <input
                  key={`${data.title}-height`}
                  aria-label="Custom height"
                  type="number"
                  min="32"
                  max="4096"
                  defaultValue={data.height}
                  disabled={data.disabled}
                  onBlur={(event) =>
                    data.updateData({
                      height: Math.max(
                        32,
                        Math.min(4096, Number(event.target.value) || data.height),
                      ),
                    })
                  }
                />
              </label>
            </div>
            {data.campaign && <OutputPreview item={data.item} campaign={data.campaign} />}
            <small className="create-node-decision">
              {data.item
                ? `${data.item.variant?.replaceAll('-', ' ') || data.item.state} · ${data.item.report?.hardViolations?.length || 0} blockers · ${data.item.report?.warnings?.length || 0} notes`
                : data.connected
                  ? 'Connected · ready to generate'
                  : 'Connect Layout to enable'}
            </small>
            {data.item && (
              <details
                className="create-node-evidence nodrag nowheel"
                onPointerDown={(event) => event.stopPropagation()}
              >
                <summary>Decision evidence</summary>
                {!data.current && <p>Inputs changed. Generate again before using this draft.</p>}
                {(data.item.report?.hardViolations || []).map((violation, index) => (
                  <p key={`block-${index}`}>{violation.message}</p>
                ))}
                {(data.item.report?.warnings || []).map((warning, index) => (
                  <p key={`warn-${index}`}>{warning.message}</p>
                ))}
                {data.item.message && <p>{data.item.message}</p>}
                <pre>
                  {JSON.stringify(
                    {
                      candidate: data.item.candidateId,
                      input: data.item.layoutInputHash,
                      score: data.item.score,
                      measurements: data.item.report?.measurements,
                      alternatives: data.item.alternatives,
                      rejected: data.item.rejected?.map((rejected) => ({
                        candidate: rejected.id,
                        reasons: rejected.hardViolations,
                      })),
                    },
                    null,
                    2,
                  )}
                </pre>
              </details>
            )}
            {data.item && (
              <div className="create-node-output-actions">
                {data.item.state === 'succeeded' && (
                  <>
                    <NodeAction
                      label={data.accepted ? 'Added to Studio' : `Use ${data.title} in Studio`}
                      shortLabel={data.accepted ? 'In Studio' : 'Use in Studio'}
                      icon={Check}
                      disabled={data.disabled || data.accepted || !data.current}
                      onClick={data.accept}
                    />
                    <NodeAction
                      label={`Download ${data.title} PNG`}
                      icon={Download}
                      disabled={data.disabled}
                      onClick={data.download}
                    />
                    {data.accepted && (
                      <NodeAction
                        label={`Edit ${data.title} in Studio`}
                        icon={Image}
                        disabled={data.disabled}
                        onClick={data.open}
                      />
                    )}
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>
      <footer className="create-node-footer">
        {data.kind === 'image' || data.kind === 'copy' ? (
          <NodeAction
            label="Edit in Studio"
            icon={Image}
            disabled={data.disabled}
            onClick={data.editCampaign}
          />
        ) : null}
        {data.kind === 'compose' && (
          <NodeAction
            label={data.busy ? 'Queue connected formats' : 'Generate banner drafts'}
            icon={Play}
            primary
            disabled={data.placementLocked || data.queued}
            onClick={data.runConnected}
          />
        )}
        {data.kind === 'planner' && (
          <NodeAction
            label={data.busy ? 'Queue Qwen layout suggestions' : 'Generate Qwen layout suggestions'}
            shortLabel="Suggest layouts"
            icon={Sparkles}
            primary
            disabled={
              data.placementLocked || data.queued || data.enabled === false || !data.connected
            }
            onClick={data.runConnected}
          />
        )}
        {data.kind === 'output' && (
          <NodeAction
            label={data.busy ? `Queue ${data.title} only` : `Generate ${data.title} only`}
            icon={Play}
            primary
            disabled={data.placementLocked || data.queued || !data.connected}
            onClick={data.runOutput}
          />
        )}
      </footer>
      <div className="create-node-ports">
        {inputs.map(([port, type], index) => (
          <div
            className="create-node-port create-node-port-in"
            key={port}
            style={{ top: 55 + index * 29 }}
          >
            <Handle id={port} type="target" position={Position.Left} />
            <span>{type}</span>
          </div>
        ))}
        {outputs.map(([port, type], index) => (
          <div
            className="create-node-port create-node-port-out"
            key={port}
            style={{ top: 55 + index * 29 }}
          >
            <span>{type}</span>
            <Handle id={port} type="source" position={Position.Right} />
          </div>
        ))}
      </div>
    </article>
  );
});
const nodeTypes = { create: CreateNode };

export default function CreateGraph({
  flow,
  changeFlow,
  selectedId,
  onSelect,
  project,
  marketId,
  changeCampaign,
  batches,
  onAcceptAll,
  onExportDrafts,
  onExportMatrix,
  onUndoGeneration,
  canUndo,
  onCancelGeneration,
  toolbar,
  statusText,
  image,
  modelStatus,
  florenceStatus,
  latestOutput,
  onRunOutput,
  onAcceptOutput,
  onOpenOutput,
  onDownloadOutput,
  onEditCampaign,
  onUploadImage,
  onRunConnected,
  updateData,
  busy,
  queuedNodes,
  activeNodeIds,
  placementLocked,
  disabled,
}) {
  const flowInstance = useRef(null);
  const previousCount = useRef(flow.nodes.length);
  useEffect(() => {
    const added = flow.nodes.length > previousCount.current;
    previousCount.current = flow.nodes.length;
    if (!added) return;
    const timer = setTimeout(
      () =>
        flowInstance.current?.fitView({ padding: 0.08, minZoom: 0.3, maxZoom: 0.9, duration: 250 }),
      80,
    );
    return () => clearTimeout(timer);
  }, [flow.nodes.length]);
  const nodes = flow.nodes.map((node) => {
    const { marketId: nodeMarketId, width, height } = node.data;
    const result = node.kind === 'output' ? latestOutput(node) : null;
    const item = result?.item;
    const campaign = project.campaigns[nodeMarketId || marketId];
    const blueprintViews =
      node.kind === 'planner'
        ? flow.nodes
            .filter((other) => other.kind === 'output' && other.data.marketId === marketId &&
              flow.edges.some((edge) => edge.target === other.id && edge.targetHandle === 'drafts'))
            .map((other) => {
              const entry = project.blueprints.find((candidate) => {
                if (candidate.marketId !== marketId) return false;
                const blueprint = candidate.versions.find(
                  (version) => version.id === candidate.activeVersionId,
                )?.blueprint;
                return (
                  blueprint?.width === other.data.width && blueprint?.height === other.data.height
                );
              });
              const revision = entry?.versions.find(
                (version) => version.id === entry.activeVersionId,
              );
              const source = entry ? resolveBanner(entry, project.banners[entry.id]) : null;
              const batch = [...batches]
                .reverse()
                .find(
                  (candidate) =>
                    candidate.snapshot.market.id === marketId &&
                    candidate.items.some(
                      (item) =>
                        item.target.id ===
                        (entry?.id || `${marketId}-${other.data.width}x${other.data.height}`),
                    ),
                );
              const batchIndex = batch?.snapshot.targets.findIndex(
                (target) =>
                  target.id ===
                  (entry?.id || `${marketId}-${other.data.width}x${other.data.height}`),
              );
              return {
                id: other.id,
                width: other.data.width,
                height: other.data.height,
                saved: revision?.blueprint || null,
                revisionId: revision?.id || null,
                source: batchIndex >= 0 ? batch.snapshot.bases[batchIndex] : source,
                hasOverride: Boolean(entry && project.banners[entry.id]?.override),
                draft:
                  batch?.items.find(
                    (item) =>
                      item.target.id ===
                      (entry?.id || `${marketId}-${other.data.width}x${other.data.height}`),
                  ) || null,
              };
            })
        : null;
    const sizes = [
      ...new Set([
        ...STARTER_TARGETS.map((target) => `${target.width}x${target.height}`),
        ...project.blueprints
          .filter((entry) => entry.marketId === (nodeMarketId || marketId))
          .map((entry) => {
            const bp = entry.versions.find((v) => v.id === entry.activeVersionId).blueprint;
            return `${bp.width}x${bp.height}`;
          }),
        `${width}x${height}`,
      ]),
    ];
    const connected = flow.edges.some((edge) =>
      node.kind === 'planner'
        ? edge.source === node.id && edge.sourceHandle === 'plan'
        : edge.target === node.id && edge.targetHandle === 'drafts',
    );
    const current = result ? snapshotIsCurrent(result.batch.snapshot, project) : false;
    const accepted = Boolean(
      item?.scene && project.banners[item.scene.id]?.generation?.batchId === result.batch.id,
    );
    let status = item?.state;
    if (item && !current) status = 'stale';
    if (accepted) status = 'in-studio';
    if (
      busy &&
      (activeNodeIds.includes(node.id) || ['analysis', 'planner', 'compose'].includes(node.kind))
    )
      status = 'running';
    if (queuedNodes.includes(node.kind === 'compose' ? null : node.id)) status = 'queued';
    return {
      id: node.id,
      width: 230,
      height:
        node.kind === 'output'
          ? 285
          : node.kind === 'compose'
            ? 310
            : node.kind === 'copy'
              ? 260
              : node.kind === 'planner'
                ? 430
                : 170,
      measured: node.measured,
      type: 'create',
      position: node.position,
      selected: node.id === selectedId,
      data: {
        ...node.data,
        kind: node.kind,
        item,
        campaign,
        changeCampaign,
        batches,
        batch: batches.find((batch) => batch.snapshot.market.id === marketId) || null,
        project,
        acceptAll: onAcceptAll,
        exportDrafts: onExportDrafts,
        exportMatrix: onExportMatrix,
        undoGeneration: onUndoGeneration,
        cancelGeneration: onCancelGeneration,
        canUndo,
        connected,
        accepted,
        current,
        markets: project.markets,
        sizes,
        disabled,
        busy: Boolean(busy),
        queued: queuedNodes.includes(node.kind === 'compose' ? null : node.id),
        placementLocked,
        updateData: (patch) => updateData(node.id, patch),
        select: () => onSelect(node.id),
        editCampaign: onEditCampaign,
        uploadImage: onUploadImage,
        runConnected: onRunConnected,
        runOutput: () => onRunOutput(node.id),
        accept: () => onAcceptOutput(node.id),
        open: () => onOpenOutput(node.id),
        download: () => onDownloadOutput(node.id),
        status,
        title: node.kind === 'output' ? `${width} × ${height}` : null,
        marketName: project.markets.find((m) => m.id === (nodeMarketId || marketId))?.name,
        image: node.kind === 'image' ? image : null,
        headline: node.kind === 'copy' ? project.currentHeadline : null,
        modelStatus,
        florenceStatus,
        blueprintViews,
        minimumFont: node.data.policy?.minimumFont,
      },
    };
  });
  const edges = flow.edges.map((edge) => ({
    ...edge,
    type: 'smoothstep',
    animated: Boolean(busy),
    style: { stroke: '#697777', strokeWidth: 2 },
    markerEnd: { type: MarkerType.ArrowClosed, color: '#697777', width: 16, height: 16 },
  }));
  return (
    <div className="create-graph-canvas" role="region" aria-label="Create node canvas">
      <div className="create-graph-toolbar">{toolbar}</div>
      <div className="create-graph-status" role="status">
        {statusText}
      </div>
      <div className="create-graph-mobile-hint">Drag canvas to reach Format nodes →</div>
      <ReactFlow
        onInit={(instance) => {
          flowInstance.current = instance;
        }}
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={(changes) => {
          if (disabled) return;
          const removed = changes.filter((c) => c.type === 'remove').map((c) => c.id);
          changeFlow(
            (old) => ({
              ...old,
              nodes: applyNodeChanges(changes, old.nodes),
              edges: removed.length
                ? old.edges.filter(
                    (e) => !removed.includes(e.source) && !removed.includes(e.target),
                  )
                : old.edges,
            }),
            { save: Boolean(removed.length) },
          );
          if (removed.includes(selectedId)) onSelect(null);
        }}
        onEdgesChange={(changes) => {
          if (!disabled)
            changeFlow((old) => ({ ...old, edges: applyEdgeChanges(changes, old.edges) }));
        }}
        onNodeDragStop={() => changeFlow((old) => old)}
        onNodeClick={(_, node) => onSelect(node.id)}
        onEdgeClick={() => onSelect(null)}
        onPaneClick={() => onSelect(null)}
        isValidConnection={(connection) => !disabled && canConnect(flow, connection)}
        onConnect={(connection) => {
          if (!disabled && canConnect(flow, connection))
            changeFlow((old) => ({
              ...old,
              edges: [...old.edges, { ...connection, id: edgeId(connection) }],
            }));
        }}
        onReconnect={(oldEdge, connection) => {
          if (disabled) return;
          changeFlow((old) => {
            const without = { ...old, edges: old.edges.filter((e) => e.id !== oldEdge.id) };
            return canConnect(without, connection)
              ? { ...without, edges: [...without.edges, { ...connection, id: edgeId(connection) }] }
              : old;
          });
        }}
        nodesDraggable={!disabled}
        nodesConnectable={!disabled}
        edgesReconnectable={!disabled}
        elementsSelectable={!disabled}
        deleteKeyCode={disabled ? null : ['Backspace', 'Delete']}
        snapToGrid
        snapGrid={[20, 20]}
        fitView
        fitViewOptions={{ padding: 0.08, minZoom: 0.42, maxZoom: 0.9 }}
        minZoom={0.3}
        maxZoom={1.5}
        colorMode="dark"
        proOptions={{ hideAttribution: false }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1.2} color="#30383a" />
        <Controls showInteractive={false} />
        <MiniMap
          pannable
          zoomable
          nodeColor={(n) =>
            n.data.kind === 'output' ? '#8fcbb6' : n.data.kind === 'planner' ? '#d1fe17' : '#536763'
          }
        />
      </ReactFlow>
    </div>
  );
}
