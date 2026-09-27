# Banner Blueprint Studio

Read `docs/README.md`, `docs/SYSTEM.md`, `docs/BLUEPRINT-SPEC.md`, `docs/ASSET-AUDIT.md` and `docs/STATUS.md` before changing the system. Preserve `PROJECT-HANDOFF.md` and every original in `assets/`.

The user's current stack is Vite, React and JavaScript (.js/.jsx), superseding TypeScript in the old handoff. Keep components and rendering modules reusable. Market IDs, dimensions and layouts are configurable data. Do not hardcode a Finnish legal string in the renderer or claim the UK layout is reference-matched without evidence.

Canvas preview and export must share the rendering/timeline pipeline. Saved master revisions are immutable; edits create new revisions. Campaign exceptions belong to local override snapshots. Original assets remain content-hashed and unchanged. Do not bake final pixels into blueprint JSON.

Run core tests, relevant browser workflow tests, and a production build for renderer/state/export changes. Visually inspect modified layouts. Do not substitute functional checks for visual reference approval. Keep the status document honest about incomplete brand assets, references and product capabilities.

OpenCV.js is part of V1 image analysis. AI segmentation remains optional V2 and must not block normal local rendering. No deployment is implied by local implementation work.
