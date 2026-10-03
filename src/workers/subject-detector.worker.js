import {
  env,
  CLIPTokenizer,
  OwlViTImageProcessor,
  OwlViTProcessor,
  AutoModelForZeroShotObjectDetection,
  ZeroShotObjectDetectionPipeline,
  RawImage,
} from '@huggingface/transformers';
import { subjectLabels, normalizeDetections, SUBJECT_THRESHOLD } from '../core/subject-data.js';

// All weights and WASM are served with the app; original images stay in this worker.
env.allowRemoteModels = false;
env.allowLocalModels = true;
// Isolate these pinned assets from legacy pipeline entries that cached HTML fallbacks.
env.cacheKey = 'bannerflow-owlvit-4cba1467c378f89779ae66c7eff8f0f64985a0e3';
env.localModelPath = `${self.location.origin}/vendor/models/`;
env.backends.onnx.wasm.numThreads = 1;
env.backends.onnx.wasm.wasmPaths = {
  mjs: `${self.location.origin}/vendor/onnx/ort-wasm-simd-threaded.asyncify.mjs`,
  wasm: `${self.location.origin}/vendor/onnx/ort-wasm-simd-threaded.asyncify.wasm`,
};
self.onmessage = async ({ data }) => {
  try {
    self.postMessage({ type: 'progress', message: 'Loading Browser AI…' });
    const name = 'owlvit-base-patch32-ONNX',
      options = { local_files_only: true };
    // Explicit components avoid the pipeline factory's remote file-discovery step.
    const readConfig = async (file) => {
      const response = await fetch(`${env.localModelPath}${name}/${file}`);
      if (!response.ok || !response.headers.get('content-type')?.includes('json'))
        throw new Error(
          'Browser AI model is not installed. Run npm run model:prepare, use SAM 3, or choose manual focus.',
        );
      return response.json();
    };
    await readConfig('config.json');
    const [model, tokenizerJSON, tokenizerConfig, imageConfig] = await Promise.all([
      AutoModelForZeroShotObjectDetection.from_pretrained(name, {
        ...options,
        dtype: 'q8',
        device: 'wasm',
      }),
      readConfig('tokenizer.json'),
      readConfig('tokenizer_config.json'),
      readConfig('preprocessor_config.json'),
    ]);
    const tokenizer = new CLIPTokenizer(tokenizerJSON, tokenizerConfig);
    const processor = new OwlViTProcessor(
      {},
      { tokenizer, image_processor: new OwlViTImageProcessor(imageConfig) },
      null,
    );
    const detector = new ZeroShotObjectDetectionPipeline({
      task: 'zero-shot-object-detection',
      model,
      processor,
      tokenizer,
    });
    self.postMessage({ type: 'progress', message: 'Finding subjects with Browser AI…' });
    const image = await RawImage.fromBlob(data.blob);
    const raw = await detector(image, subjectLabels(data.query), {
      threshold: SUBJECT_THRESHOLD,
      top_k: 30,
      percentage: true,
    });
    self.postMessage({ type: 'result', results: normalizeDetections(raw) });
    await detector.dispose();
  } catch (error) {
    self.postMessage({ type: 'error', message: error.message });
  }
};
