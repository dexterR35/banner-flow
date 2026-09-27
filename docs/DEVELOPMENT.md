# Development

## Run

```sh
cd /home/dexter/Desktop/projects/banner-flow
npm ci
npm run model:prepare
npm run dev
```

Open http://localhost:5178. Node 22.12+ is required. The dependency install copies the pinned OpenCV and ONNX browser runtimes into `public/vendor`; this keeps analysis local and avoids downloading code on demand from a third-party CDN. Interface fonts are bundled. Production campaign fonts are uploaded separately.

```sh
npm test
npm run test:e2e
npm run build
npm run preview
```

Playwright requires its Chromium runtime (`npx playwright install chromium` if missing). The browser suite uses a fresh IndexedDB per test context. It verifies market isolation, added dimensions, override isolation, immutable revision pinning, PNG dimensions, GIF delays, uploaded assets, OpenCV, portable backup/restore and mobile dashboard overflow. Route tests cover Outlet navigation, market/campaign state, browser history, reloads, editor deep links and recovery from unknown pages/entries. Unit tests cover seed validity, custom size boundaries, invalid graphs/timing, timeline evaluation and text overflow. Production build emits `dist/`.

The app uses browser routing. Production hosting must fall back to `index.html` for application URLs that do not point to static files. Verify a direct load of `/campaign?market=UK` and `/blueprints/FI-300x250/edit` after hosting changes.

Maintenance commands:

```sh
npm run assets:audit       # requires Python 3 + Pillow
npm run schema:document    # JSON schema + generated seed snapshots
```

## Component map

- `src/App.jsx`: small application entry with BrowserRouter and style imports.
- `src/app/`: route definitions, navigation configuration, workspace provider/context and global dialogs/status.
- `src/layouts/`: `WorkspaceLayout` renders the sidebar/topbar and an `Outlet`; `Page` provides content spacing and an optional secondary panel.
- `src/pages/`: campaign, blueprints, assets, banner/blueprint editors and not-found route compositions.
- `src/components/ui/`: shared buttons, inputs, labeled fields, cards, info cards, titles, feedback and accessible modal dialogs, exported through `index.js`.
- `src/components/workspace/`: sidebar, topbar, market-aware page header and workspace dialogs.
- `src/components/campaign/`: campaign controls, reusable zoom/pan artboard workspace, toolbar and searchable format collection.
- `src/components/assets/ReferenceCard.jsx`: audited reference preview and metadata.
- `src/components/banner/BannerPreview.jsx`: native-dimension canvas proofs from the shared renderer.
- `src/components/editor/Editor.jsx`: shared properties, layer actions, JSON editing and undo/redo for inline Studio, the focused banner editor and the structural blueprint editor. Blueprint mode renders labeled boxes through the same frame/timing pipeline, hides campaign copy/assets, and saves immutable standard revisions with matching-banner synchronization. The quick fade-only dialog shares that save path.
- `src/components/editor/TextLayoutControls.jsx`: text flow, per-format copy/rows, vertical alignment, line spacing, fitted-size feedback and available-space action.
- `src/components/editor/CanvasEditor.jsx`: lazy-loaded Konva canvas selection, dragging and transforming.
- `src/components/editor/Timeline.jsx`: scenes, duration, ordering, crossfade, per-layer visibility/in/out/fades.
- `src/hooks/`: `useProject` for persistence/assets, `useWorkspaceController` for workspace actions and `useWorkspace` for context access.
- `src/styles/`: theme tokens and shared/feature styles.

See [UI-COMPONENTS.md](UI-COMPONENTS.md) for the full source tree, component props, examples and steps for adding pages. Shared UI primitives accept props; feature containers and pages consume workspace context.

The baseline is intentionally one Vite application with explicit modules, rather than a premature monorepo. Core modules can become packages when there is a second consumer.

Image/glow regression coverage includes rotated-frame crop bounds, preserved fade geometry, one-step drag undo, per-banner persistence, legacy JSON defaults, glow extending beyond the glyph box, an exact disabled-glow roundtrip, PNG/preview pixel equality and decoded GIF glow pixels. Browser tests use isolated storage rather than the user's workspace.

Text-layout coverage includes balanced rows without lost words, joined single-line copy, manual breaks, minimum-size overflow, legacy defaults, local copy bindings, shared-space use across cut GIF parts, movement/crossfade obstacles and blocked layouts. Browser checks reproduce the old 320×50 top-aligned box, verify the larger fitted result and undo/redo, confirm persistence and format isolation, and compare PNG/GIF pixels to the shared renderer. Before/after and editor screenshots are saved under `test-results/`.

## Data persistence

Automatic-layout coverage includes copy-driven text allocation, collision-free text across FI/UK presets, GIF cut/crossfade visibility, preserved logo/legal/timing and source revisions, local typography choices, and legacy project validation. Browser workflows exercise automatic text/image updates, market isolation, automatic updates without a generation button, the off/manual/on controls, repeatable manual arrangement, saved editor exceptions, reloads, and arranged PNG/preview pixel equality. `useResources` keys readiness by asset bindings to prevent layout against a previous image or font during an upload.

`bannerflow-project-v1` is the project key in IndexedDB (`idb-keyval`). Immutable asset blobs use `asset:<SHA-256>`. State saves are serialized. The interface reports saving/saved/error states. Backups contain project JSON and exact uploaded bytes. Imports validate before replacing the workspace; hash mismatches and missing backup assets are rejected. Downloading a campaign set is distinct from backing up the workspace.

Browser AI processes user images in the browser. Optional SAM 3 sends an image to the loopback-only Python service on this computer; it makes no external inference requests. Uploaded SVGs are decoded as image resources, never injected as markup. Sources are limited to local files and bundled references. Tests should not reuse the user's live browser storage.

## Common implementation changes

- Add reference associations in `src/data/reference-map.json` and update the audit; associations seed new entries. Existing workspace links remain fixed and require an explicit project-data update to rebind.
- Add common dimensions to `PRESETS`; saved market entries remain independent.
- Change fresh-workspace composition factories in `createBlueprint`. Existing revisions are preserved; Studio edits create banner overrides. Reusable revision changes require an explicit project-data migration, not library editing.
- Add quality checks in `qualityReport`; never silently shrink legal text below a layer minimum.
- Add a renderer capability only after preview and all relevant export paths agree.
- Subject detection runs behind `core/subject-detection.js`, selecting the optional local SAM 3 service or disposable OWL-ViT Web Worker. Keep model imports out of the renderer/editor. Segmentation masks remain a future renderer capability.

## Manual visual QA

Inspect reference and generated artwork at native size for every market, size and scene. Check logo proportions, line breaks, source-image coverage, fade direction, CTA padding, legal legibility and timing. Automated tests prove functional invariants; they do not certify reference matching or regulatory approval.

## Local subject finder

`npm run model:prepare` fetches the pinned quantized [OWL-ViT model](https://huggingface.co/onnx-community/owlvit-base-patch32-ONNX) and prepares the WASM runtime. Weights are approximately 156 MB (SHA-256 checked by the setup script); they are served with the app from `public/vendor/models/`, not requested from a third party while editing. Run setup before building or running the real-model browser test. Normal rendering and manual focus work if the model is missing. Models/runtime are generated dependencies excluded from source control; `dist/` includes them for standalone hosting.

Transformers.js 4.3.0 runs browser inference in `workers/subject-detector.worker.js`. The worker allows local models only, uses one WASM thread without cross-origin isolation, and is terminated after completion, cancellation or a three-minute timeout. On this path, images stay in the browser. Search results, the chosen provider and normalized focus boxes persist with the campaign asset ID and survive project backups. Only the focus geometry affects layout; pixels remain in the original asset.

`npm run dev` also starts the optional Python adapter from `services/sam3_server.py`; `npm run dev:ui` starts only Vite. `core/subject-service.js` validates its HTTP contract. Automatic mode checks the service and falls back to Browser AI; selecting SAM 3 explicitly exposes setup/inference failures. `useSubjectService` provides a non-polling connection check. See [local service setup](../services/README.md) for checkpoint paths, interpreter configuration, hardware limitations, loopback proxy behavior and cancellation semantics. The default backend is now Transformers 5.17.0 in the optional project venv, with CPU support. The approved account is authenticated and full trained weights are installed. The real application test found four subjects in the reference photo in 34.4 seconds with the model already loaded, preserving focus and matching exported PNG pixels. A tiny random-model test remains available without gated weights.

`npm run test:sam3` runs ten Python checks, including Transformers CPU loading/inference with tiny random test weights. Five SAM 3 browser tests use HTTP fixtures to verify integration without implying a working model. Run them alongside the real Browser AI test and the full application suite.

`SubjectFocusPanel` provides query/preset buttons, detected-box selection and a manual source-image region. `useSubjectFocus` owns automatic upload searches and guards against stale results after changing assets, queries or markets. `subject-position.js` chooses a cover crop around the focus, scoring clipping, overlays and fade, with a review note when the fixed frame cannot accommodate it. Subject positioning changes focal coordinates and zoom; the existing arrangement pass may separately resize the photo frame.

Subject tests include a real local model inference with no external requests, original/master preservation, persistence and PNG/preview equality; isolated worker fixtures cover failures, no matches and cancellation. Core tests cover obstacle/fade avoidance, impossible crops, bounded metadata and asset scoping. GIF-toggle tests cover static/timeline visibility, playback stopping, part preservation, undo and saved/reloaded mode.

Persistence status is revision-aware: an earlier queued IndexedDB write cannot mark a newer unsaved edit as Saved locally.

Run the trained SAM 3 browser smoke with `BANNERFLOW_TEST_SUBJECT_ENGINE=sam3 npx playwright test tests/e2e/subject-focus.spec.js --grep "real local model" --workers=1` while the local service is idle. The normal test uses Browser AI and verifies recovery from HTML cached in the old Transformers cache namespace. Pinned OWL-ViT assets now use their own revision-specific cache namespace. Full-model validation evidence is stored under `docs/verification/`.

Busy SAM 3 requests now wait for the previous inference to finish, with abortable readiness checks under the existing three-minute deadline. The queue test verifies a successful retry and cancellation by manual focus.


Artboard regression coverage (`tests/e2e/artboard.spec.js`) checks a fresh page load, top-center action placement, camera zoom ratios and reset, pointer panning over a banner without accidental editing, Ctrl-wheel zoom, Fit all, click-to-edit, size search, responsive bounds and unchanged saved project data. Subject action fixtures cover explicit placement with auto arrangement off, separate manual search, no matches, cancellation and persistence. `tests/focus-market.test.js` verifies crop-only changes against the current layout, immutable source/override data, market isolation and idempotence. These HTTP fixtures exercise integration without running the trained model.


`tests/e2e/placement-lock.spec.js` covers SAM 3 priority from a previously selected Browser AI preference, indeterminate accessible progress, disabled editing/uploads/exports/import while waiting, enabled camera controls, reference-library entry points, editor history, uninterrupted Browser AI fallback, cancellation, inference failure, and restored editing. Desktop/mobile loading states are captured with deferred HTTP fixtures; these tests exercise UI/integration behavior without re-evaluating trained-model accuracy.
