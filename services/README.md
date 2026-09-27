# Local SAM 3 subject finder

The app sends an uploaded image and object query to a loopback-only Python service. Normalized subject boxes feed the existing per-format crop engine. Frames, fades, original files and master revisions retain their existing behavior. Segmentation masks are not yet used for background removal or separate subject layers.

## Current setup · 27 September 2026

**Transformers is the default backend and supports CPU.** The separate `.venv-sam3` environment contains Transformers 5.17.0, Accelerate 1.15.0 and Hugging Face Hub 1.33.0. It reuses the machine's installed PyTorch 2.13.0 and torchvision 0.28.0 through system site packages. Global packages and the source checkout at `/home/dexter/Desktop/projects/sam3` were not changed.

Hugging Face's [SAM 3 model card](https://huggingface.co/facebook/sam3) documents `Sam3Model` / `Sam3Processor` with a CPU fallback. This implementation avoids the hard-coded CUDA allocations in the separate Meta checkout. The installed AMD/PyTorch setup has no GPU acceleration available, so the service selects CPU and limits Torch to four threads.

The approved Hugging Face account is now signed in locally and the full trained weights (3,439,938,512 bytes) are downloaded at the pinned revision. A real application test found **four person/face matches** in the football reference photo. A search with the model already loaded took **34.4 seconds on CPU**; saved focus, market/master isolation and exact PNG/preview pixel equality passed. This is one reference-image smoke test, not a general accuracy benchmark. The smaller random-model test remains useful for runtime checks without gated weights. See the [verified result](../docs/verification/sam3-real-cpu.png) and [test record](../docs/verification/sam3-cpu.json).

## Model access and download on another machine

Request access to [facebook/sam3](https://huggingface.co/facebook/sam3) through your own Hugging Face account and review its conditions there. Once approved, run these commands in a terminal:

```sh
cd /home/dexter/Desktop/projects/banner-flow
.venv-sam3/bin/hf auth login
npm run sam3:download
```

The CLI starts a browser device-authorization flow. Open its link, enter its short code and authorize with the approved account; wait for the CLI to report success. No token needs to be pasted into chat or source files. The downloader verifies the existing account's model access. It does not accept terms, create an account or bypass the access gate. It downloads Transformers JSON/tokenizer/Safetensors files from pinned revision `3c879f39826c281e95690f02c7821c4de09afae7`, excluding the separate native `sam3.pt` checkpoint.

After download, use **Check connection**, then **Find subject**. Model loading happens on the first search. Files stay in the standard Hugging Face cache, or in `BANNERFLOW_SAM3_MODEL` if configured. If your Transformers files are already downloaded at another path/revision, set that variable to the folder containing `config.json`, processor/tokenizer files and `model.safetensors` (or its complete shard index and shards). The source checkout alone and a native `.pt` file are not a Transformers model folder.

## Run and configuration

`npm run dev` starts Vite and the optional Python service, or reuses an existing Bannerflow service on port 5181. It stops only the child processes it started. `npm run dev:ui` runs Vite alone; `npm run sam3:serve` runs the adapter alone. These commands select `BANNERFLOW_PYTHON`, then `.venv-sam3/bin/python` if present, then `python3`.

To recreate the optional environment on a machine with working PyTorch and torchvision:

```sh
python3 -m venv --system-site-packages .venv-sam3
.venv-sam3/bin/python -m pip install -r services/requirements-transformers.txt
```

For a fully isolated environment, install the appropriate PyTorch/torchvision build for that machine inside it first. `services/requirements.txt` covers the HTTP adapter only; `requirements-transformers.txt` adds the pinned Transformers stack. The browser app remains usable if Python/model setup is incomplete.

| Variable | Meaning | Default |
| --- | --- | --- |
| `BANNERFLOW_SAM3_BACKEND` | `transformers` or `native` | `transformers` |
| `BANNERFLOW_SAM3_MODEL` | Local Transformers model folder | Pinned HF cache snapshot |
| `BANNERFLOW_PYTHON` | Python executable used by npm commands | Project venv, then `python3` |
| `BANNERFLOW_SAM3_REPO` | Source directory for native backend | Sibling `sam3` directory |
| `BANNERFLOW_SAM3_CHECKPOINT` | Native backend's local `sam3.pt` | Source root, source `checkpoints/`, then usual HF cache |

Restart the service after changing the interpreter, backend or paths. An already-running service is reused and retains its original environment. Native mode remains available for a compatible runtime and native checkpoint; its CUDA requirement applies only to that checkout/backend. Transformers mode uses explicit image classes, Float32, SDPA and `local_files_only=True`, with remote custom code disabled. It reuses image features across text queries and uses the official object-detection postprocessor to avoid allocating original-resolution segmentation masks. Inference never downloads model files or requests credentials.

## Controls and behavior

- **Automatic** uses SAM 3 when its preflight checks pass, falling back to local OWL-ViT for an offline service, missing setup, inference failure, timeout or invalid response.
- **Browser AI** directly uses OWL-ViT. Run `npm run model:prepare` to install its local assets.
- **SAM 3** explicitly requires the Python service and exposes errors. Manual focus, editing and export remain available.
- **Check connection** refreshes diagnostics without loading weights. “Available” means files/runtime preflight passed; the first search still needs to validate and load the model.
- A valid search with no matches remains a no-match result and preserves an existing focus. Provider, preference, query and results persist with the image ID and survive backups.
- Changing image, query, market or provider cancels the client request and discards late results. A running Python operation may finish in the background. When the service is busy, the client shows a waiting message, polls readiness and submits the latest search once the service is free. Waiting shares the three-minute request deadline; changing the image/query or selecting manual focus cancels the wait. CPU searches can exceed that deadline. The model remains loaded until shutdown; restart after an inference error to retry a corrected environment.

## API and privacy

The service binds `127.0.0.1:5181`. Vite proxies `/api/subjects` in dev and local production preview, rejecting non-loopback clients. The adapter restricts Host and Origin to the local app on ports 5178, 5179 or 4173. Static hosting does not include Python; Browser AI/manual selection remain available. A hosted SAM 3 deployment would need a separately authenticated API and is outside this integration.

`GET /health` returns `{service, schemaVersion, ready, state, loaded, device, issues, backend, note}`. It checks prerequisites without constructing the model. Missing CUDA is not an issue in Transformers CPU mode.

`POST /detect?query=person` accepts raw PNG/JPEG/WebP bytes (30 MB and 40 megapixels maximum). Queries are bounded to 160 characters and five unique comma-separated labels; `person` adds a face query. EXIF orientation is normalized. Input images are bounded to 1600 px on the longer edge before the model processor applies its configured resolution. Output is `{service, schemaVersion, engine: "sam3", detections: [{label, score, box: {xmin, ymin, xmax, ymax}}]}` in normalized source coordinates. Model results use a 0.5 threshold and are validated again in JavaScript.

SAM 3 receives image bytes in a process on this computer, keeps them in memory for inference and writes no image files. Browser AI processes images in the browser. Neither inference path sends images externally. The separate model-download command contacts Hugging Face using the user's existing authorized login.

## Verification

`npm run test:sam3` runs ten service tests in the optional environment: API/input bounds, normalized coordinates, EXIF orientation, origin restrictions, native CUDA prerequisites, CPU preflight, complete local shards and real Transformers CPU execution with a tiny random model. The CPU execution test is skipped when Transformers is absent. TestClient also requires `httpx` in the test environment.

The five SAM 3 browser tests use HTTP fixtures for integration success, persistence, fallback, malformed responses, explicit errors, busy-service waiting and cancellation. They do not establish trained-model accuracy. The existing subject-focus test runs real local OWL-ViT inference and checks persisted crops against exported pixels.

To repeat the full trained-model application test once the service is ready and idle:

```sh
BANNERFLOW_TEST_SUBJECT_ENGINE=sam3 npx playwright test tests/e2e/subject-focus.spec.js --grep "real local model" --workers=1
```

This opt-in run uses an isolated browser workspace and the bundled reference photo; it does not replace the user's campaign image. Browser AI is the default for the same test and includes a corrupted legacy model-cache fixture. Its pinned assets now use a dedicated cache namespace, avoiding HTML responses retained by earlier pipeline versions.
