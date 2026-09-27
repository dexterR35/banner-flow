import { mkdir, copyFile, readdir } from 'node:fs/promises';
await mkdir('public/vendor/onnx', { recursive: true });
for (const name of await readdir('node_modules/onnxruntime-web/dist')) {
  if (/^ort-wasm-simd-threaded\.asyncify\.(wasm|mjs)$/.test(name))
    await copyFile(`node_modules/onnxruntime-web/dist/${name}`, `public/vendor/onnx/${name}`);
}
console.log('Prepared the local subject-detection runtime.');
