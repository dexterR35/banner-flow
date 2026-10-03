# Local SAM 3 subject finder

The app sends an uploaded image and object query to a loopback-only Python service. Normalized subject boxes feed the existing per-format crop engine. Frames, fades, original files and master revisions retain their existing behavior. The optional image-tools routes can now use SAM instance masks with BiRefNet matting for source-preserving subject cutouts and aligned overlay layers. Box detection remains independently usable.

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
- Changing image, query, market or provider cancels the client request and discards late results. A running Python operation may finish in the background. When the service is busy, the client shows a waiting message, polls readiness and submits the latest search once the service is free. Waiting shares the three-minute request deadline; changing the image/query or selecting manual focus cancels the wait. CPU searches can exceed that deadline. The model stays loaded until another model family needs memory or the service shuts down; restart after an inference error to retry a corrected environment.

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

## Optional asset intelligence adapters

The existing loopback service now exposes `/vision/capabilities`, `/vision/ocr`, `/vision/embed`, `/vision/plan` and `/vision/media` (through `/api/subjects` in Vite). It retains Host/Origin checks, bounded uploads and no inference-time downloads. OCR uses an installed Tesseract executable and installed language packs; this machine has English. Media sampling uses Pillow for GIF/WebP and local FFmpeg/ffprobe for video, up to 30 MB, 120 seconds, 4 megapixels and 12 sampled frames.

Qwen uses the exact requested `Qwen/Qwen2.5-VL-3B-Instruct` family; semantic search uses `google/siglip2-base-patch16-naflex`. Qwen is installed in the build environment at pinned revision `66285546d2b821cf421d4f5eb2576359d3770cd3`; SigLIP NaFlex is not installed. Qwen discovers that snapshot in the standard Hugging Face cache on each machine. For custom installations, configure `BANNERFLOW_QWEN_MODEL` / `BANNERFLOW_SIGLIP_MODEL` to their local snapshot directories and the corresponding `BANNERFLOW_QWEN_REVISION` / `BANNERFLOW_SIGLIP_REVISION` to immutable 40-character commit hashes. Use the pinned `services/requirements-transformers.txt` runtime (5.17.0). Capabilities report setup problems without loading models. No newer/different checkpoint is substituted.

Profiles include model/processor revision, config hashes, runtime, dtype, patch budget, alpha compositing, text preprocessing and prompt version. The adapter uses local files only and no remote model code. The shared local-service scheduler serializes heavy requests across SAM, image tools and vision. Switching families releases other resident models and clears the CUDA allocator cache before loading. This coordinates one service process, not unrelated applications or additional service processes.

The browser owns durable assets and results. The inference process holds no canonical campaign database and never receives filesystem paths from a model. Qwen can only propose allowed variants/IDs; client validation rejects extra fields, copy mutations and invented references. OCR/model text remains untrusted display/search evidence.

Real-checkpoint smoke tests require explicit `BANNERFLOW_REAL_QWEN=1` or `BANNERFLOW_REAL_SIGLIP=1` and configured installed snapshots. Normal service tests skip those gates and verify unavailable-model behavior. Fixture tests do not establish model quality. The adapter APIs follow the official [Qwen2.5-VL](https://huggingface.co/docs/transformers/model_doc/qwen2_5_vl) and [SigLIP2](https://huggingface.co/docs/transformers/model_doc/siglip2) runtime contracts.


## Portable Qwen activation

Qwen planning and image analysis are enabled by default in **Create**. Each machine selects its own hardware profile; the build machine is not a deployment restriction. Weights load lazily on the first generation, not on a health check. No Qwen inference is required to build the frontend.

| Application profile | Hardware budget | Execution |
| --- | --- | --- |
| CUDA, preferred automatically | 16 GB system RAM and 12 GB GPU VRAM; at least 6 GiB RAM and 9 GiB VRAM free at load time | BF16 if supported, otherwise FP16; streams weights directly to the selected GPU |
| CPU fallback | 24 GB system RAM minimum, 32 GB recommended; at least 18 GiB RAM free | FP32, bounded CPU threads |

These are conservative **application budgets for this unquantized 3B profile**, not official universal Qwen minimum requirements or measured throughput guarantees. Detection tolerances are 14/22 GiB physical system RAM and 11 GiB GPU VRAM to account for usable versus installed capacity. Input is one bounded image (64–256 visual tokens), at most 6,000 input tokens and 1,024 output tokens. Actual CUDA inference/peak memory still needs verification on the destination GPU. No quantized checkpoint, disk offload or different model is silently substituted.

On a new Linux/Windows machine:

1. Install a supported Python environment in `.venv-sam3` (or set `BANNERFLOW_PYTHON`). Install the hardware-compatible PyTorch and torchvision build using the [official PyTorch selector](https://pytorch.org/get-started/locally/), then `python -m pip install -r services/requirements-transformers.txt`. `psutil` provides portable RAM detection. CUDA requires a compatible NVIDIA driver and CUDA-enabled PyTorch; RAM alone does not supply GPU acceleration.
2. Run `npm run qwen:download` once, or copy the exact complete pinned snapshot into the usual Hugging Face cache. Allow about 8 GB for weights and processor files, plus the Python runtime. The download is explicit; HTTP inference stays local and offline.
3. Run `npm run qwen:check` to see installed/ready status, detected RAM/VRAM, chosen device/dtype and requirements, without loading weights.
4. Start/restart `npm run dev`. Open **Create**, supply image/copy, and click **Generate banner drafts**. Qwen activates on demand when the selected profile qualifies. The UI reports the actual device or prerequisite failure. On a suitable machine, `npm run qwen:smoke` explicitly loads the real checkpoint and checks a small image-to-plan contract before using campaign images.

`BANNERFLOW_QWEN_DEVICE` defaults to `auto`; optional values are `cpu`, `cuda` or `cuda:N`. Auto chooses an adequate CUDA device, otherwise CPU. Explicit CUDA requests report an error when unavailable rather than silently changing the requested device. Smaller GPUs can use the CPU profile if RAM qualifies. Other operating systems can use the CPU path when the pinned Python/PyTorch dependencies are supported; Apple MPS and quantized GPU profiles are not implemented.

Model/processor/shard completeness is checked without tensor allocation. Device, dtype, CUDA runtime and PyTorch version participate in the model profile fingerprint. Available memory is rechecked after model handoff. An out-of-memory failure releases the vision instance and returns a visible fallback reason. A cancelled browser job cannot save a late result, although server inference may finish within its bounded generation loop.

## Florence-2 reference and Create analysis

The finished-banner import in Blueprints and the connected **Analyze image** node in Create use the pinned [`florence-community/Florence-2-base-ft`](https://huggingface.co/florence-community/Florence-2-base-ft) checkpoint, revision `0b03b6f15a4a211370fb204aee4e7dd48887ea37`. It runs the documented `<OCR_WITH_REGION>` and `<OD>` tasks through the installed Transformers processor and postprocessor. Requests stay on the loopback service; inference loads local weights only and does not run remote model code. The model snapshot is downloaded explicitly into the standard Hugging Face cache.

```sh
npm run florence:download
npm run florence:check
npm run florence:smoke
```

Run the download/check on each machine that will analyze images. The service uses `.venv-sam3` or `BANNERFLOW_PYTHON` and the pinned `services/requirements-transformers.txt` runtime. `BANNERFLOW_FLORENCE_MODEL` and `BANNERFLOW_FLORENCE_REVISION` can select a complete local snapshot at an immutable commit. `BANNERFLOW_FLORENCE_DEVICE` accepts `auto`, `cpu`, `cuda` or `cuda:N`. Auto selects a CUDA device with at least 4 GiB total VRAM or CPU otherwise; explicit CUDA does not switch to CPU. The application preflight budgets 8 GiB physical RAM and 2 GiB available RAM (plus 2 GiB free VRAM for CUDA). These are conservative application thresholds, not a vendor guarantee for every workload. A machine with 32 GB RAM is sufficient for the CPU profile if the pinned runtime and weights are installed. CUDA additionally needs a compatible GPU, driver and CUDA-enabled PyTorch.

Blueprint import maps only Florence OCR boxes into editable, unassigned text layers. It does not infer a legal/CTA/logo/hero role, invent a box, or copy the reference's words into campaign content. Users assign roles and review the draft before saving a new immutable revision; an existing size opens as unsaved changes. Create stores Florence text/object evidence in the frozen batch and passes OCR evidence to Qwen for allowed variant ranking; the strict solver and shared renderer still own actual placement and export. OpenCV separately measures pixel appearance, and SAM 3 remains an optional subject-focus tool. Neither substitutes for Florence regions. Missing or failed Florence prevents reference import and generation through a connected Analyze image node; original assets and saved master revisions remain untouched.

On this CPU-only build machine, the installed trained checkpoint found 9 text regions and 5 object regions in one local 300×600 reference smoke. This verifies real inference and the response contract, not region accuracy across markets or reference fidelity. Manual role assignment and visual approval remain necessary.

## Blueprint-aware Qwen planning

The Qwen planner receives compact snapshots of up to four connected static saved Blueprints with at most 20 layers each. Its optional `blueprintEdits` can move/resize existing boxes or reorder existing layer IDs for a specific target and revision. The browser verifies identity, bounds, exact copy, locks and strict output quality before selecting a proposal. Saved Blueprint revisions are never written by planning; accepted output is a campaign-local override. Animated Blueprints are visible in Create but excluded from automatic geometry proposals because their timelines require manual review. The prompt allows up to 2,048 generated tokens and its cache version is 3. Florence-2 OCR/object regions are inputs to Qwen, not a fallback implementation of the Qwen planning contract.
