# Banner Blueprint Studio documentation

Start with [SYSTEM.md](SYSTEM.md), then [BLUEPRINT-SPEC.md](BLUEPRINT-SPEC.md). [ASSET-AUDIT.md](ASSET-AUDIT.md) records what is actually supplied; [DEVELOPMENT.md](DEVELOPMENT.md) describes the implementation and checks. [UI-COMPONENTS.md](UI-COMPONENTS.md) covers the JSX source structure, shared controls, pages, routing and Outlet, with usage examples. [STATUS.md](STATUS.md) distinguishes the working foundation from remaining production work.

The original [project handoff](../PROJECT-HANDOFF.md) is preserved. The user's latest direction takes precedence: Vite, React and **JavaScript**, reusable components, configurable markets and dimensions, a shared standard with market-specific layouts, editable fades, and timing for each GIF part. FI and UK references are starting points, not approved templates. More reference sizes can be added later.

## System vocabulary

| Concept | Responsibility |
| --- | --- |
| Size preset | Width and height; shared across markets |
| Common blueprint | Draft composition rules that seed new market/size combinations |
| Market | Locale, legal copy, logo/font asset bindings and configured sizes |
| Blueprint revision | Immutable layout and timeline snapshot for one market and size |
| Campaign | One set of copy and original asset bindings for a market |
| Generated banner | Pins a blueprint revision; may carry local override revisions |
| Scene | One animation part with its own duration and per-layer tracks |
| Reference | Evidence for a layout; never automatically an approved blueprint |

## Updating the standard

1. Put new source references in `assets/` without changing earlier files.
2. Run `npm run assets:audit` to record hashes, dimensions and GIF timing and copy references to the preview directory.
3. Associate the reference with the appropriate market and size in `src/data/reference-map.json`. Joker5 variants, native dimensions, role boxes and GIF sequences are catalogued together in `src/data/joker5.js`; see [the Joker5 audit](JOKER5-REFERENCES.md). The audit also extracts deterministic first-frame PNGs for demo crops, while retaining the original GIFs for comparison.
4. View each market’s layout boxes in Blueprints. Use Open original to compare any linked source artwork. Add/duplicate a size to open its blueprint editor. Arrange reusable boxes, fades and timing, then save; Studio uses the layout with the market’s logo, font and hero assets.
5. Review text fit, legal treatment, all scenes, output dimensions and file weight at native size.
6. Choose **Save blueprint** to append a standard revision and update the matching Studio banner automatically. The changed standard properties apply while local copy, crop and unrelated customizations remain. **Edit blueprint fade** offers a quick fade-only dialog with up to 16 points. Studio saves remain local overrides; original references and previous revisions are preserved. Previously saved mesh revisions synchronize once when their market opens; no Reset banner is needed.

## Image-and-copy generation

Open **Create** for a connected draft-generation graph. The Image node uploads or replaces the active market’s source. The Copy node edits the market’s exact headline, subtitle, CTA and legal copy and holds the creative brief. The Analyze image node requires local Florence-2 to extract text and object regions; optional Qwen planning and strict layout composition feed connected Format nodes. Drag nodes, connect matching ports, and add formats or markets with the graph controls. New Format nodes connect to Layout automatically. The Compose node holds layout policy, batch generation, acceptance, ZIP export, cancellation and undo. Each Format node holds market and custom dimensions, its own generate/queue action, draft preview, fit and decision evidence, PNG download and Studio handoff. Node action buttons use the app’s green primary color. The separate settings pane and result cards have been removed. The graph is saved locally with the workspace and included in verified backups. Only connected formats generate; each result remains a reviewable draft before acceptance into Studio. The [implementation coverage and remaining gates](IMPLEMENTATION-BLUEPRINT-STATUS.md) describe the asset library, local analysis/model adapters, immutable generation snapshots, job coordination, media frame import and accounted exports. Existing Studio layouts retain their original fitting behavior.

The Qwen node identifies the saved Blueprint revision and shows the banner starting layout beside the generated layout for a selected format. On supported static sizes, Qwen may propose bounded changes to a banner-specific copy of its Blueprint boxes. The strict solver validates those changes; accepting a draft keeps the saved Blueprint revision unchanged and stores the result as a local Studio override. Florence supplies image regions but does not replace Qwen as a layout planner.
