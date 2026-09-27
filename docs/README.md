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
3. Associate the reference with the appropriate market and size in `src/data/reference-map.json`.
4. View each market’s layout boxes in Blueprints. Use Open original to compare any linked source artwork. Add/duplicate a size to open its blueprint editor. Arrange reusable boxes, fades and timing, then save; Studio uses the layout with the market’s logo, font and hero assets.
5. Review text fit, legal treatment, all scenes, output dimensions and file weight at native size.
6. Choose **Save blueprint** to append a standard revision and update the matching Studio banner automatically. The changed standard properties apply while local copy, crop and unrelated customizations remain. **Edit blueprint fade** offers a quick fade-only dialog with up to 16 points. Studio saves remain local overrides; original references and previous revisions are preserved. Previously saved mesh revisions synchronize once when their market opens; no Reset banner is needed.
