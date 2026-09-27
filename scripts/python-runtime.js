import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const localPython = fileURLToPath(new URL('../.venv-sam3/bin/python', import.meta.url));
export const python =
  process.env.BANNERFLOW_PYTHON || (existsSync(localPython) ? localPython : 'python3');
