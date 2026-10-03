import { embeddingSchema } from './contracts.js';
export function normalizeVector(vector) {
  if (
    !Array.isArray(vector) ||
    !vector.length ||
    vector.length > 8192 ||
    vector.some((v) => !Number.isFinite(v))
  )
    throw new Error('Invalid vector.');
  const norm = Math.hypot(...vector);
  if (!norm) throw new Error('Zero vector.');
  return vector.map((v) => Math.fround(v / norm));
}
export function exactSearch(records, query, profileId, eligibleIds, topK = 30) {
  const q = normalizeVector(query),
    eligible = new Set(eligibleIds);
  return records
    .filter((r) => r.profileId === profileId && eligible.has(r.assetId))
    .map((r) => {
      const e = embeddingSchema.parse(r);
      if (e.dimension !== q.length) throw new Error('PROFILE_MISMATCH: vector dimensions differ.');
      return { assetId: e.assetId, similarity: e.vector.reduce((s, v, i) => s + v * q[i], 0) };
    })
    .sort((a, b) => b.similarity - a.similarity || a.assetId.localeCompare(b.assetId))
    .slice(0, Math.max(1, Math.min(100, topK)));
}
const normalize = (s) =>
  String(s || '')
    .normalize('NFKC')
    .toLocaleLowerCase()
    .trim();
export function lexicalSearch(assets, query, corrections = {}, analyses = []) {
  const q = normalize(query),
    tokens = q.split(/\s+/).filter(Boolean);
  return assets
    .map((asset) => {
      const c = corrections[asset.id]?.value || {},
        ocr = analyses
          .filter((a) => a.assetId === asset.id && a.component === 'ocr' && a.status === 'ready')
          .flatMap((a) => a.ocr || [])
          .map((o) => o.text)
          .join(' ');
      const text = normalize([asset.name, ...(c.tags || []), c.ocrText || ocr].join(' '));
      return {
        assetId: asset.id,
        score: !q
          ? 1
          : (normalize(asset.name) === q ? 100 : 0) + tokens.filter((t) => text.includes(t)).length,
      };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.assetId.localeCompare(b.assetId));
}
export function fuseRanks(channels) {
  const scores = new Map();
  channels.forEach((channel, channelIndex) =>
    channel.forEach((hit, index) => {
      const old = scores.get(hit.assetId) || { assetId: hit.assetId, score: 0, channels: [] };
      old.score += 1 / (60 + index + 1);
      old.channels.push(channelIndex);
      scores.set(hit.assetId, old);
    }),
  );
  return [...scores.values()].sort(
    (a, b) => b.score - a.score || a.assetId.localeCompare(b.assetId),
  );
}
export function retrievalMetrics(ranked, relevant, k = 10) {
  const labels = new Set(relevant),
    hits = ranked.slice(0, k).map((id) => (labels.has(id) ? 1 : 0));
  const dcg = hits.reduce((s, r, i) => s + r / Math.log2(i + 2), 0),
    ideal = Array.from({ length: Math.min(k, labels.size) }, (_, i) => 1 / Math.log2(i + 2)).reduce(
      (a, b) => a + b,
      0,
    );
  return {
    recall: labels.size ? hits.reduce((a, b) => a + b, 0) / labels.size : 0,
    ndcg: ideal ? dcg / ideal : 0,
  };
}

export function rankInWorker(records, query, profileId, eligibleIds, { signal, topK = 30 } = {}) {
  return new Promise((resolve, reject) => {
    signal?.throwIfAborted();
    const worker = new Worker(new URL('../../workers/retrieval.worker.js', import.meta.url), {
      type: 'module',
    });
    const stop = () => {
      worker.terminate();
      signal?.removeEventListener('abort', abort);
    };
    const abort = () => {
      stop();
      reject(signal.reason);
    };
    signal?.addEventListener('abort', abort, { once: true });
    worker.onmessage = ({ data }) => {
      stop();
      data.error ? reject(new Error(data.error)) : resolve(data.hits);
    };
    worker.onerror = () => {
      stop();
      reject(new Error('Local retrieval worker failed.'));
    };
    worker.postMessage({ records, query, profileId, eligibleIds, topK });
  });
}
