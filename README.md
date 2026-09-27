# Bannerflow · Blueprint Studio

A local Vite + React + JavaScript foundation for NetBet campaign production: choose a market, enter content once, automatically update all configured sizes, refine exceptions, and export a set.

```sh
npm ci
npm run dev
```

Open **http://localhost:5178**. Requires Node 22.12+. Use `npm run build` for the production bundle, `npm test` for core tests and `npm run test:e2e` for workflow checks.

## Start here

- [Documentation index](docs/README.md)
- [System architecture](docs/SYSTEM.md)
- [Blueprint and timeline contract](docs/BLUEPRINT-SPEC.md)
- [Asset audit](docs/ASSET-AUDIT.md)
- [Development guide](docs/DEVELOPMENT.md)
- [Reusable JSX components and source structure](docs/UI-COMPONENTS.md)
- [Implementation status](docs/STATUS.md)
- [Original project handoff](PROJECT-HANDOFF.md)

## Working foundation

- Eight initial sizes each for FI and UK; add markets and arbitrary dimensions.
- Shared composition standard with independent market blueprints.
- Layer editor, text auto-fit, word accent color and optional text glow.
- Automatic text/photo arrangement when copy or assets change, with per-market Match blueprints and Arrange now controls beside Auto place subject on the canvas; Match blueprints toggles the saved layout constraint with an active highlight, while Arrange now toggles automatic arrangement and applies it immediately when enabled.
- Drag each banner's photo inside a fixed frame/fade; adjust image zoom or switch to Edit frame for layout changes.
- Structural blueprint editor for new and existing sizes: move/resize/rotate boxes, edit fades and GIF parts, then save to update the matching Studio banner.
- Immutable blueprint revisions and independent per-banner override snapshots; local text, crops and unrelated edits survive standard updates.
- Timeline parts with individual durations, layer visibility, in/out and fade timing; add more parts.
- Local person/object search, automatic per-size subject crop and manual focus selection. Run `npm run model:prepare` once to prepare the local detector.
- Optional SAM 3 connection with automatic browser fallback and visible setup diagnostics. See [local SAM 3 setup](services/README.md); the Transformers CPU runtime and authorized model weights are installed and tested on this machine.
- PNG/JPEG/WebP, GIF and ZIP campaign export with an output manifest; timeline controls appear only with Create GIF enabled.
- Original uploads, local IndexedDB persistence, ZIP workspace backup/import.
- Locally bundled OpenCV.js image analysis, loaded on demand.

**Reference status:** all eight supplied examples are Finnish. UK is a proposed draft until references arrive. The included photo is a low-resolution reference crop, the text wordmark is a placeholder, and Arial is a fallback. Supply original imagery, production fonts, a standalone NetBet logo and reviewed market legal copy before approving output. These drafts establish the system; they are not a completed production template library.

Blueprints are **JSON layout instructions**, not image files. Original photo/logo/font files stay separate. The renderer combines a blueprint with campaign content and optional per-banner overrides to generate the final PNG, JPEG, WebP or GIF.
