/** Optional local SAM 3 with a lazy browser fallback; cancelled results are ignored. */
import { subjectServiceStatus, detectWithSam3 } from './subject-service.js';

export async function detectSubjects(blob, query, options = {}) {
  const { engine = 'auto', signal, onProgress = () => {}, onEngine = () => {} } = options;
  if (engine !== 'browser') {
    try {
      onProgress('Checking local SAM 3…');
      const status = await subjectServiceStatus(signal);
      if (!status.ready) throw new Error(status.issues.map((item) => item.message).join(' '));
      onProgress('Finding subjects with SAM 3…');
      const results = await detectWithSam3(blob, query, signal, onProgress);
      onEngine('sam3');
      return results;
    } catch (error) {
      if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
      if (engine === 'sam3') throw new Error(`SAM 3 unavailable. ${error.message}`);
      onProgress('SAM 3 unavailable. Using browser AI…');
    }
  }
  onEngine('browser');
  return detectInBrowser(blob, query, options);
}

export function detectInBrowser(blob, query, { signal, onProgress = () => {} } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('Cancelled', 'AbortError'));
    const worker = new Worker(new URL('../workers/subject-detector.worker.js', import.meta.url), {
      type: 'module',
    });
    let settled = false;
    const finish = (error, results) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      worker.onmessage = null;
      worker.onerror = null;
      worker.terminate();
      error ? reject(error) : resolve(results);
    };
    const abort = () => finish(new DOMException('Cancelled', 'AbortError'));
    const timer = setTimeout(() => finish(new Error('Subject search timed out.')), 180_000);
    signal?.addEventListener('abort', abort, { once: true });
    worker.onmessage = ({ data }) => {
      if (data.type === 'progress') onProgress(data.message);
      if (data.type === 'result') finish(null, data.results);
      if (data.type === 'error') finish(new Error(data.message));
    };
    worker.onerror = (event) =>
      finish(new Error(event.message || 'Subject finder could not start.'));
    worker.postMessage({ blob, query });
  });
}
