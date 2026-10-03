import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Plus, Trash2, RotateCcw } from 'lucide-react';
import Page from '../layouts/Page.jsx';
import WorkspacePageHeader from '../components/workspace/WorkspacePageHeader.jsx';
import { Button } from '../components/ui/index.js';
import { useWorkspace } from '../hooks/useWorkspace.js';
import {
  STARTER_TARGETS,
  generationSnapshot,
  generateBatch,
  snapshotIsCurrent,
  acceptBatch,
  assertBatchCorrectionsCurrent,
  undoBatch,
  exportBatch,
  exportMatrix,
} from '../core/generation/batch.js';
import { strictPolicy } from '../core/generation/contracts.js';
import { download, renderOutput } from '../core/export.js';
import { loadResources } from '../core/storage.js';
import { visionCapabilities } from '../core/generation/planner.js';
import {
  defaultFlow,
  cleanFlow,
  compileFlow,
  edgeId,
  NODE_KINDS,
} from '../core/generation/flow.js';
import CreateGraph from '../components/generation/CreateGraph.jsx';
import '../styles/generation.css';

function latestOutput(project, node) {
  if (node?.kind !== 'output') return null;
  for (const batch of [...(project.generationBatches || [])].reverse()) {
    if (batch.snapshot.market.id !== node.data.marketId) continue;
    if (batch.outputNodeIds && !batch.outputNodeIds.includes(node.id)) continue;
    const item = batch.items.find(
      (candidate) =>
        candidate.target.width === node.data.width && candidate.target.height === node.data.height,
    );
    if (item) return { batch, item };
  }
  return null;
}

function onlyOutput(batch, item) {
  const index = batch.items.indexOf(item);
  return {
    ...batch,
    items: [item],
    snapshot: {
      ...batch.snapshot,
      targets: [batch.snapshot.targets[index]],
      bases: [batch.snapshot.bases[index]],
      blueprintRevisionIds: [batch.snapshot.blueprintRevisionIds[index]],
    },
  };
}

export default function GenerationPage() {
  const {
    project,
    setProject,
    market,
    campaign,
    resources,
    subject,
    setView,
    upload,
    changeCampaign,
  } = useWorkspace();
  const navigate = useNavigate();
  const [flow, setFlow] = useState(
    () => project.generationFlows?.[market.id] || defaultFlow(market.id),
  );
  const [selectedId, setSelectedId] = useState('compose');
  const [addMarketId, setAddMarketId] = useState(market.id);
  const [modelStatus, setModelStatus] = useState('Checking local Qwen…');
  const [florenceStatus, setFlorenceStatus] = useState('Checking local Florence-2…');
  const [busy, setBusy] = useState(''),
    [message, setMessage] = useState('');
  const [queuedNodes, setQueuedNodes] = useState([]);
  const [activeNodeIds, setActiveNodeIds] = useState([]);
  const controller = useRef(null),
    queueRef = useRef([]),
    flowRef = useRef(flow),
    latest = useRef(project);
  latest.current = project;
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    const abort = new AbortController();
    visionCapabilities(abort.signal)
      .then((caps) => {
        (setModelStatus(
          caps.qwen?.ready
            ? `Ready on ${caps.qwen.deviceName || caps.qwen.device || 'this machine'}`
            : caps.qwen?.message || 'Qwen unavailable. Layout rules can still run.',
        ),
          setFlorenceStatus(
            caps.florence?.ready
              ? `Ready on ${caps.florence.deviceName || caps.florence.device || 'this machine'}`
              : caps.florence?.message || 'Florence-2 is required for Analyze image.',
          ));
      })
      .catch(() => {
        if (!abort.signal.aborted) {
          setModelStatus('Local model service is offline. Layout rules can still run.');
          setFlorenceStatus('Local Florence-2 service is offline.');
        }
      });
    return () => abort.abort();
  }, []);
  useEffect(() => {
    controller.current?.abort();
    const next = project.generationFlows?.[market.id] || defaultFlow(market.id);
    flowRef.current = next;
    setFlow(next);
    setSelectedId('compose');
    setAddMarketId(market.id);
    setBusy('');
    setMessage('');
    queueRef.current = [];
    setQueuedNodes([]);
    setActiveNodeIds([]);
  }, [market.id]);
  function changeFlow(updater, { save = true } = {}) {
    const next = typeof updater === 'function' ? updater(flowRef.current) : updater;
    flowRef.current = next;
    setFlow(next);
    if (save)
      setProject((p) => ({
        ...p,
        generationFlows: { ...(p.generationFlows || {}), [market.id]: cleanFlow(next) },
      }));
  }
  function updateData(id, patch) {
    changeFlow((old) => ({
      ...old,
      nodes: old.nodes.map((node) =>
        node.id === id ? { ...node, data: { ...node.data, ...patch } } : node,
      ),
    }));
  }
  function addNode(kind) {
    if (kind !== 'output' && flowRef.current.nodes.some((n) => n.kind === kind)) {
      setSelectedId(flowRef.current.nodes.find((n) => n.kind === kind).id);
      return;
    }
    const outputs = flowRef.current.nodes.filter((n) => n.kind === 'output');
    if (flowRef.current.nodes.length >= 110 || (kind === 'output' && outputs.length >= 100)) {
      setMessage('The flow can contain at most 100 format outputs.');
      return;
    }
    const existing = new Set(flowRef.current.nodes.map((n) => n.id));
    let count = 1;
    while (existing.has(`${kind}-${count}`)) count++;
    const id = `${kind}-${count}`;
    const sameMarket = outputs.filter((node) => node.data.marketId === addMarketId);
    const lastColumn = sameMarket.length
      ? Math.max(...sameMarket.map((node) => node.position.x))
      : Math.max(825, ...outputs.map((node) => node.position.x)) + 265;
    const inColumn = sameMarket.filter((node) => node.position.x === lastColumn).length;
    const outputPosition = [
      inColumn >= 3 ? lastColumn + 265 : lastColumn,
      25 + (inColumn >= 3 ? 0 : inColumn) * 300,
    ];
    const positions = {
      image: [20, 40],
      copy: [20, 275],
      analysis: [285, 40],
      planner: [550, 275],
      compose: [815, 95],
      output: outputPosition,
    };
    const [x, y] = positions[kind];
    const selectedTargets = new Set(
      flowRef.current.nodes
        .filter((n) => n.kind === 'output' && n.data.marketId === addMarketId)
        .map((n) => `${n.data.width}x${n.data.height}`),
    );
    const target = STARTER_TARGETS.find((t) => !selectedTargets.has(`${t.width}x${t.height}`)) || {
      width: 600,
      height: 400,
    };
    const data =
      kind === 'output'
        ? { marketId: addMarketId, ...target }
        : kind === 'compose'
          ? { policy: strictPolicy(), manualLayouts: false }
          : kind === 'planner'
            ? { enabled: true }
            : kind === 'copy'
              ? { brief: '' }
              : {};
    changeFlow((old) => {
      const added = { id, kind, position: { x, y }, data };
      const compose = old.nodes.find((node) => node.kind === 'compose');
      const connection =
        kind === 'output' && compose
          ? {
              source: compose.id,
              sourceHandle: 'drafts',
              target: id,
              targetHandle: 'drafts',
            }
          : null;
      return {
        ...old,
        nodes: [...old.nodes, added],
        edges: connection ? [...old.edges, { ...connection, id: edgeId(connection) }] : old.edges,
      };
    });
    setSelectedId(id);
  }
  function addMarketFormats() {
    const current = flowRef.current;
    const existing = new Set(
      current.nodes
        .filter((n) => n.kind === 'output' && n.data.marketId === addMarketId)
        .map((n) => `${n.data.width}x${n.data.height}`),
    );
    const targets = STARTER_TARGETS.filter((t) => !existing.has(`${t.width}x${t.height}`));
    if (!targets.length) {
      setMessage('Starter formats for this market are already on the canvas.');
      return;
    }
    if (
      current.nodes.length + targets.length > 110 ||
      current.nodes.filter((n) => n.kind === 'output').length + targets.length > 100
    ) {
      setMessage('The flow can contain at most 100 format outputs.');
      return;
    }
    const nextColumn =
      Math.max(825, ...current.nodes.filter((n) => n.kind === 'output').map((n) => n.position.x)) +
      265;
    let seq = 1;
    const used = new Set(current.nodes.map((n) => n.id));
    const nodes = targets.map((target, index) => {
      while (used.has(`output-${seq}`)) seq++;
      const id = `output-${seq++}`;
      used.add(id);
      return {
        id,
        kind: 'output',
        position: { x: nextColumn + Math.floor(index / 3) * 265, y: 25 + (index % 3) * 300 },
        data: { marketId: addMarketId, ...target },
      };
    });
    changeFlow((old) => ({
      ...old,
      nodes: [...old.nodes, ...nodes],
      edges: old.nodes.some((n) => n.kind === 'compose')
        ? [
            ...old.edges,
            ...nodes.map((n) => ({
              id: edgeId({
                source: old.nodes.find((x) => x.kind === 'compose').id,
                sourceHandle: 'drafts',
                target: n.id,
                targetHandle: 'drafts',
              }),
              source: old.nodes.find((x) => x.kind === 'compose').id,
              sourceHandle: 'drafts',
              target: n.id,
              targetHandle: 'drafts',
            })),
          ]
        : old.edges,
    }));
    setSelectedId(nodes[0].id);
    setMessage(
      `${targets.length} format nodes added for ${project.markets.find((m) => m.id === addMarketId)?.name}.`,
    );
  }
  const run = project.generationRuns?.filter((r) => r.ownerMarketId === market.id).at(-1);
  const oldBatch = project.generationBatches
    ?.filter((b) => b.snapshot.market.id === market.id)
    .at(-1);
  const batches = run
    ? run.batchIds.map((id) => project.generationBatches?.find((b) => b.id === id)).filter(Boolean)
    : oldBatch
      ? [oldBatch]
      : [];
  const disabled = subject.placing || Boolean(busy);
  let readiness = '';
  try {
    compileFlow(cleanFlow(flow), project);
  } catch (error) {
    readiness = error.message;
  }
  const selectedNode = flow.nodes.find((n) => n.id === selectedId);
  async function generate(outputNodeId = null) {
    if (controller.current) {
      if (!queueRef.current.includes(outputNodeId)) {
        queueRef.current.push(outputNodeId);
        setQueuedNodes([...queueRef.current]);
      }
      return;
    }
    setMessage('');
    const abort = new AbortController();
    controller.current = abort;
    setBusy('Checking connected nodes…');
    try {
      const config = compileFlow(cleanFlow(flowRef.current), latest.current, { outputNodeId });
      if (config.groups.length > 20) throw new Error('Run up to 20 markets at once.');
      const results = [];
      for (const group of config.groups) {
        abort.signal.throwIfAborted();
        setActiveNodeIds(group.outputs.map((node) => node.id));
        const snapshot = generationSnapshot(
          latest.current,
          group.marketId,
          group.outputs.map((n) => ({ width: n.data.width, height: n.data.height })),
          config.policy,
        );
        const batch = await generateBatch(snapshot, {
          signal: abort.signal,
          brief: config.brief,
          usePlanner: config.usePlanner,
          automaticAnalysis: config.automaticAnalysis,
          onProgress: (text) => setBusy(`${group.marketId} · ${text}`),
        });
        results.push({
          ...batch,
          workflow: cleanFlow(flowRef.current),
          outputNodeIds: group.outputs.map((n) => n.id),
        });
      }
      if (abort.signal.aborted) {
        setMessage('Graph run cancelled; previous drafts were retained.');
        return;
      }
      setProject((p) => ({
        ...p,
        generationBatches: [
          ...(p.generationBatches || []).filter((b) => !results.some((r) => r.id === b.id)),
          ...results,
        ].slice(-20),
        generationRuns: [
          ...(p.generationRuns || []),
          { ownerMarketId: market.id, batchIds: results.map((r) => r.id) },
        ].slice(-20),
      }));
      if (outputNodeId) setSelectedId(outputNodeId);
    } catch (error) {
      if (!abort.signal.aborted) setMessage(error.message);
    } finally {
      if (controller.current === abort) {
        controller.current = null;
        setBusy('');
        setActiveNodeIds([]);
        const next = queueRef.current.shift();
        setQueuedNodes([...queueRef.current]);
        if (next !== undefined) queueMicrotask(() => generate(next));
      }
    }
  }
  async function accept(selectedBatch) {
    try {
      await assertBatchCorrectionsCurrent(selectedBatch);
      setProject(acceptBatch(latest.current, selectedBatch));
      setMessage(
        'Accepted valid drafts into Studio. Previous banners can be restored with Undo generation.',
      );
    } catch (error) {
      setMessage(error.message);
    }
  }
  async function acceptOutput(nodeId) {
    const node = flowRef.current.nodes.find((candidate) => candidate.id === nodeId);
    const result = latestOutput(latest.current, node);
    if (!result || result.item.state !== 'succeeded') return;
    await accept(onlyOutput(result.batch, result.item));
  }
  function openOutput(nodeId) {
    const node = flowRef.current.nodes.find((candidate) => candidate.id === nodeId);
    const result = latestOutput(latest.current, node);
    if (!result?.item.scene) return;
    navigate(
      `/campaign/${encodeURIComponent(result.item.scene.id)}/edit?market=${encodeURIComponent(node.data.marketId)}`,
    );
  }
  async function downloadOutput(nodeId) {
    try {
      const node = flowRef.current.nodes.find((candidate) => candidate.id === nodeId);
      const result = latestOutput(latest.current, node);
      if (result?.item.state !== 'succeeded') return;
      const resources = await loadResources(result.batch.snapshot.campaign);
      const blob = await renderOutput(
        result.item.scene,
        result.batch.snapshot.campaign,
        resources,
        'png',
      );
      download(blob, `${node.data.marketId}-${node.data.width}x${node.data.height}-draft.png`);
    } catch (error) {
      setMessage(error.message);
    }
  }
  async function exportDrafts() {
    if (!batches.length) return;
    setBusy('Exporting generated drafts…');
    try {
      download(
        await exportBatch(
          batches.find((batch) => batch.snapshot.market.id === market.id) || batches[0],
          { onProgress: setBusy },
        ),
        'bannerflow-generated-drafts.zip',
      );
      setMessage('Draft ZIP includes all requested targets and reasons for omissions.');
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy('');
    }
  }
  async function acceptAll() {
    try {
      for (const batch of batches) await assertBatchCorrectionsCurrent(batch);
      setProject((projectBefore) => {
        const accepted = [];
        let next = projectBefore;
        for (const batch of batches) {
          next = acceptBatch(next, batch);
          accepted.push(...next.generationUndo.accepted);
        }
        if (batches.length > 1)
          next.generationUndo = {
            batchId: batches.at(-1).id,
            marketId: market.id,
            accepted,
          };
        return next;
      });
      setMessage(
        'Accepted valid drafts into Studio. Previous banners can be restored with Undo generation.',
      );
    } catch (error) {
      setMessage(error.message);
    }
  }
  async function exportAllMarkets() {
    setBusy('Exporting market matrix…');
    try {
      download(
        await exportMatrix(batches, { onProgress: setBusy }),
        'bannerflow-market-matrix.zip',
      );
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy('');
    }
  }
  function undoGeneration() {
    try {
      setProject(undoBatch(latest.current));
      setMessage('Previous banners restored.');
    } catch (error) {
      setMessage(error.message);
    }
  }
  const toolbar = (
    <>
      <Button variant="secondary" disabled={disabled} onClick={() => addNode('output')}>
        <Plus size={15} /> Add format
      </Button>
      <label className="create-market-picker">
        Market for new formats
        <select
          value={addMarketId}
          onChange={(event) => setAddMarketId(event.target.value)}
          disabled={disabled}
        >
          {project.markets.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </label>
      <Button variant="secondary" disabled={disabled} onClick={addMarketFormats}>
        <Plus size={15} /> Add market formats
      </Button>
      <select
        className="create-add-node-select"
        aria-label="Add node"
        value=""
        disabled={disabled}
        onChange={(event) => {
          addNode(event.target.value);
          event.target.value = '';
        }}
      >
        <option value="">Add node</option>
        {NODE_KINDS.filter((kind) => kind !== 'output').map((kind) => (
          <option key={kind} value={kind} disabled={flow.nodes.some((node) => node.kind === kind)}>
            {kind === 'planner' ? 'Qwen planner' : kind}
          </option>
        ))}
      </select>
      <Button
        variant="secondary"
        disabled={disabled || !selectedNode}
        onClick={() => {
          changeFlow((old) => ({
            ...old,
            nodes: old.nodes.filter((node) => node.id !== selectedId),
            edges: old.edges.filter(
              (edge) => edge.source !== selectedId && edge.target !== selectedId,
            ),
          }));
          setSelectedId(null);
        }}
      >
        <Trash2 size={14} /> Remove selected
      </Button>
      <Button
        variant="secondary"
        disabled={disabled}
        onClick={() => {
          changeFlow(defaultFlow(market.id));
          setSelectedId('compose');
        }}
      >
        <RotateCcw size={14} /> Reset flow
      </Button>
    </>
  );
  return (
    <Page className="create-flow-page">
      <WorkspacePageHeader
        title="Create flow"
        description="Connect image, copy, analysis and layout nodes. Run the graph to make editable banner drafts."
      />
      <CreateGraph
        key={market.id}
        flow={flow}
        changeFlow={changeFlow}
        selectedId={selectedId}
        onSelect={setSelectedId}
        project={project}
        marketId={market.id}
        changeCampaign={changeCampaign}
        batches={batches}
        onAcceptAll={acceptAll}
        onExportDrafts={exportDrafts}
        onExportMatrix={exportAllMarkets}
        onUndoGeneration={undoGeneration}
        canUndo={project.generationUndo?.marketId === market.id}
        onCancelGeneration={() => {
          queueRef.current = [];
          setQueuedNodes([]);
          controller.current?.abort();
        }}
        toolbar={toolbar}
        statusText={
          busy ||
          message ||
          readiness ||
          `${flow.nodes.length} nodes · ${flow.edges.length} connections · ready to run`
        }
        image={resources?.hero}
        modelStatus={modelStatus}
        florenceStatus={florenceStatus}
        latestOutput={(node) => latestOutput(project, node)}
        onRunOutput={(id) => generate(id)}
        onRunConnected={() => generate()}
        onAcceptOutput={acceptOutput}
        onOpenOutput={openOutput}
        onDownloadOutput={downloadOutput}
        onEditCampaign={() => setView('campaign')}
        onUploadImage={(file) => upload(file, 'hero')}
        updateData={updateData}
        busy={busy}
        queuedNodes={queuedNodes}
        activeNodeIds={activeNodeIds}
        placementLocked={subject.placing}
        disabled={disabled}
      />
    </Page>
  );
}
