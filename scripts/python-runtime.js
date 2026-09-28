import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const windows = process.platform === 'win32';
const localPython = fileURLToPath(
  new URL(windows ? '../.venv-sam3/Scripts/python.exe' : '../.venv-sam3/bin/python', import.meta.url),
);
export const python =
  process.env.BANNERFLOW_PYTHON || (existsSync(localPython) ? localPython : windows ? 'python' : 'python3');
