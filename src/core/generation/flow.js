import { z } from 'zod';
import { STARTER_TARGETS } from '../../data/generation-targets.js';
import { strictPolicy, layoutPolicySchema } from './contracts.js';

export const FLOW_VERSION = 1;
export const NODE_KINDS = ['image', 'copy', 'analysis', 'planner', 'compose', 'output'];
export const PORTS = {
  image: { inputs: {}, outputs: { image: 'image' } },
  copy: { inputs: {}, outputs: { copy: 'copy' } },
  analysis: { inputs: { image: 'image' }, outputs: { analyzed: 'analyzed' } },
  planner: { inputs: { analyzed: 'analyzed', copy: 'copy' }, outputs: { plan: 'plan' } },
  compose: {
    inputs: { analyzed: 'analyzed', copy: 'copy', plan: 'plan' },
    outputs: { drafts: 'drafts' },
  },
  output: { inputs: { drafts: 'drafts' }, outputs: {} },
};
const id = z.string().regex(/^[a-z][a-z0-9-]{0,99}$/);
const nodeSchema = z
  .object({
    id,
    kind: z.enum(NODE_KINDS),
    position: z
      .object({
        x: z.number().finite().min(-10000).max(10000),
        y: z.number().finite().min(-10000).max(10000),
      })
      .strict(),
    data: z
      .object({
        brief: z.string().max(4000).optional(),
        enabled: z.boolean().optional(),
        policy: layoutPolicySchema.optional(),
        manualLayouts: z.boolean().optional(),
        marketId: z.string().min(1).max(100).optional(),
        width: z.number().int().min(32).max(4096).optional(),
        height: z.number().int().min(32).max(4096).optional(),
      })
      .strict(),
  })
  .strict();
const edgeSchema = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9-]{0,420}$/),
    source: id,
    sourceHandle: id,
    target: id,
    targetHandle: id,
  })
  .strict();
export const flowSchema = z
  .object({
    version: z.literal(FLOW_VERSION),
    nodes: z.array(nodeSchema).min(1).max(110),
    edges: z.array(edgeSchema).max(220),
  })
  .strict();
export const edgeId = (c) => `edge-${c.source}-${c.sourceHandle}-${c.target}-${c.targetHandle}`;

/** Keep React Flow's measurements and selection state out of saved project data. */
export function cleanFlow(flow) {
  return {
    version: flow.version,
    nodes: flow.nodes.map(({ id, kind, position, data }) => ({ id, kind, position, data })),
    edges: flow.edges.map(({ id, source, sourceHandle, target, targetHandle }) => ({
      id,
      source,
      sourceHandle,
      target,
      targetHandle,
    })),
  };
}

export function defaultFlow(marketId) {
  const node = (id, kind, x, y, data = {}) => ({ id, kind, position: { x, y }, data });
  const nodes = [
    node('image', 'image', 20, 40),
    node('copy', 'copy', 20, 275, { brief: '' }),
    node('analysis', 'analysis', 285, 40),
    node('planner', 'planner', 550, 275, { enabled: true }),
    node('compose', 'compose', 815, 95, { policy: strictPolicy(), manualLayouts: false }),
    ...STARTER_TARGETS.map((target, index) =>
      node(`output-${index + 1}`, 'output', 1090, 25 + index * 300, { marketId, ...target }),
    ),
  ];
  const connection = (source, sourceHandle, target, targetHandle) => ({
    source,
    sourceHandle,
    target,
    targetHandle,
    id: edgeId({ source, sourceHandle, target, targetHandle }),
  });
  return {
    version: FLOW_VERSION,
    nodes,
    edges: [
      connection('image', 'image', 'analysis', 'image'),
      connection('analysis', 'analyzed', 'planner', 'analyzed'),
      connection('copy', 'copy', 'planner', 'copy'),
      connection('analysis', 'analyzed', 'compose', 'analyzed'),
      connection('copy', 'copy', 'compose', 'copy'),
      connection('planner', 'plan', 'compose', 'plan'),
      ...nodes
        .filter((n) => n.kind === 'output')
        .map((n) => connection('compose', 'drafts', n.id, 'drafts')),
    ],
  };
}

function reaches(edges, start, goal, seen = new Set()) {
  if (start === goal) return true;
  if (seen.has(start)) return false;
  seen.add(start);
  return edges.some((e) => e.source === start && reaches(edges, e.target, goal, seen));
}
export function canConnect(flow, c, { replacing = false } = {}) {
  const source = flow.nodes.find((n) => n.id === c.source);
  const target = flow.nodes.find((n) => n.id === c.target);
  if (!source || !target || !c.sourceHandle || !c.targetHandle) return false;
  if (
    !PORTS[source.kind].outputs[c.sourceHandle] ||
    PORTS[source.kind].outputs[c.sourceHandle] !== PORTS[target.kind].inputs[c.targetHandle]
  )
    return false;
  const edges = replacing
    ? flow.edges.filter((e) => !(e.target === c.target && e.targetHandle === c.targetHandle))
    : flow.edges;
  if (edges.some((e) => e.target === c.target && e.targetHandle === c.targetHandle)) return false;
  if (
    edges.some(
      (e) =>
        e.source === c.source &&
        e.sourceHandle === c.sourceHandle &&
        e.target === c.target &&
        e.targetHandle === c.targetHandle,
    )
  )
    return false;
  return !reaches(edges, c.target, c.source);
}

/** Saved graphs can be incomplete while being edited; malformed connections cannot be imported. */
export function validateFlow(value) {
  const flow = flowSchema.parse(value);
  if (
    new Set(flow.nodes.map((n) => n.id)).size !== flow.nodes.length ||
    new Set(flow.edges.map((e) => e.id)).size !== flow.edges.length
  )
    throw new Error('Duplicate node or connection.');
  for (const kind of NODE_KINDS.filter((k) => k !== 'output'))
    if (flow.nodes.filter((n) => n.kind === kind).length > 1)
      throw new Error(`Only one ${kind} node is allowed.`);
  const accepted = { ...flow, edges: [] };
  for (const edge of flow.edges) {
    if (edge.id !== edgeId(edge) || !canConnect(accepted, edge))
      throw new Error('Invalid workflow connection.');
    accepted.edges.push(edge);
  }
  for (const node of flow.nodes) {
    if (node.kind === 'output' && (!node.data.marketId || !node.data.width || !node.data.height))
      throw new Error('A format node needs a market and dimensions.');
    if (node.kind === 'compose' && !node.data.policy)
      throw new Error('Layout node needs a policy.');
  }
  return flow;
}

export function compileFlow(value, project, { outputNodeId = null } = {}) {
  const flow = validateFlow(value);
  const one = (kind) => {
    const node = flow.nodes.find((n) => n.kind === kind);
    if (!node) throw new Error(`Add the ${kind} node to run this workflow.`);
    return node;
  };
  const image = one('image'),
    copy = one('copy'),
    analysis = one('analysis'),
    compose = one('compose');
  const has = (source, sourceHandle, target, targetHandle) =>
    flow.edges.some(
      (e) =>
        e.source === source.id &&
        e.sourceHandle === sourceHandle &&
        e.target === target.id &&
        e.targetHandle === targetHandle,
    );
  if (
    !has(image, 'image', analysis, 'image') ||
    !has(analysis, 'analyzed', compose, 'analyzed') ||
    !has(copy, 'copy', compose, 'copy')
  )
    throw new Error('Connect Image → Analyze → Layout and Copy → Layout.');
  const planner = flow.nodes.find((n) => n.kind === 'planner');
  const usePlanner = Boolean(planner?.data.enabled && has(planner, 'plan', compose, 'plan'));
  if (
    usePlanner &&
    (!has(analysis, 'analyzed', planner, 'analyzed') || !has(copy, 'copy', planner, 'copy'))
  )
    throw new Error('Connect analyzed image and copy to Qwen.');
  const connectedOutputs = flow.nodes.filter(
    (n) => n.kind === 'output' && has(compose, 'drafts', n, 'drafts'),
  );
  const outputs = outputNodeId
    ? connectedOutputs.filter((node) => node.id === outputNodeId)
    : connectedOutputs;
  if (!outputs.length) throw new Error('Connect Layout to at least one format output.');
  if (outputs.length > 100) throw new Error('Choose at most 100 format outputs.');
  const keys = new Set();
  for (const node of outputs) {
    const { marketId, width, height } = node.data;
    if (!project.markets.some((m) => m.id === marketId) || !project.campaigns[marketId])
      throw new Error(`Unknown market on ${node.id}.`);
    const key = `${marketId}:${width}x${height}`;
    if (keys.has(key)) throw new Error(`Duplicate format ${key}.`);
    keys.add(key);
  }
  const groups = [...new Set(outputs.map((n) => n.data.marketId))].map((marketId) => ({
    marketId,
    outputs: outputs.filter((n) => n.data.marketId === marketId),
  }));
  return {
    groups,
    usePlanner,
    automaticAnalysis: true,
    brief: copy.data.brief || '',
    policy: strictPolicy({
      ...compose.data.policy,
      variants: compose.data.manualLayouts ? compose.data.policy.variants : strictPolicy().variants,
    }),
  };
}
