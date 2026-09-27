import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const revision = '4cba1467c378f89779ae66c7eff8f0f64985a0e3';
const root = 'public/vendor/models/owlvit-base-patch32-ONNX';
const weights = 'onnx/model_quantized.onnx';
const expected = 'aabff321fbd0953f2914a6c69e44bf2dfa05ca539319fd665b591d6832e9352f';
await mkdir(`${root}/onnx`, { recursive: true });
for (const name of [
  'config.json',
  'preprocessor_config.json',
  'tokenizer.json',
  'tokenizer_config.json',
  'special_tokens_map.json',
  weights,
]) {
  let bytes;
  try {
    bytes = await readFile(`${root}/${name}`);
  } catch {}
  if (
    !bytes ||
    (name === weights && createHash('sha256').update(bytes).digest('hex') !== expected)
  ) {
    console.log(`Downloading local subject detector: ${name}`);
    const response = await fetch(
      `https://huggingface.co/onnx-community/owlvit-base-patch32-ONNX/resolve/${revision}/${name}`,
    );
    if (!response.ok) throw new Error(`Model download failed (${response.status}): ${name}`);
    bytes = Buffer.from(await response.arrayBuffer());
    if (name === weights && createHash('sha256').update(bytes).digest('hex') !== expected)
      throw new Error('Subject model checksum mismatch.');
    await writeFile(`${root}/${name}`, bytes);
  }
}
await writeFile(
  `${root}/NOTICE.txt`,
  `OWL-ViT base patch32, ONNX quantized weights\nSource: https://huggingface.co/onnx-community/owlvit-base-patch32-ONNX\nBase: https://huggingface.co/google/owlvit-base-patch32\nLicense: Apache-2.0\nRevision: ${revision}\nWeights SHA-256: ${expected}\n`,
);
console.log('Local subject model ready (156 MB quantized weights).');
