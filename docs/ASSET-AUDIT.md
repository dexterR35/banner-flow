# Source asset audit · 28 September 2026

The refreshed `assets/` inventory has 30 source references: eight NetBet FI files and 22 Joker5 files (18 GIFs and four PNGs, across 11 sizes in both Chest and Mask). The existing contact sheet is excluded. All Joker5 GIF frames last 2000 ms and loop indefinitely. The refreshed 300x100 and 300x250 files really are 300 pixels wide; they supersede the earlier mislabeled PNG references. **No UK reference, separate production logo, production font or original campaign image was supplied.** UK remains a common-system draft. [The Joker5 audit](JOKER5-REFERENCES.md) records each sequence and the remaining fidelity limits.

The machine-readable inventory is `src/data/asset-manifest.json`. It records original SHA-256 hashes, byte counts, dimensions and frame delays. Source files are preserved. `public/references/` contains copies for the reference gallery. `docs/reference-contact-sheet.png` and `docs/reference-frames/` are inspection artifacts, not campaign source masters.

| Reference | Dimensions | Frames | Delays | Total / repeat |
| --- | --- | --- | --- | --- |
| 300x250.png | 300 × 250 | 1 | — | Static |
| 300X600.png | 300 × 600 | 1 | — | Static |
| 160X600.png | 160 × 600 | 1 | — | Static |
| 320x480.png | 320 × 480 | 1 | — | Static |
| 300X50.png | 300 × 50 | 1 | — | Static |
| 320X50.gif | 320 × 50 | 3 | 2000 / 2000 / 1800 ms | 5800 ms / infinite |
| 300X100.gif | 300 × 100 | 2 | 2000 / 1800 ms | 3800 ms / infinite |
| 728X90.gif | 728 × 90 | 2 | 3000 / 1800 ms | 4800 ms / infinite |

## Observed visual rules

- Near-black/navy background. Football image fades into the background; the fade is a separate design treatment, not inferred AI segmentation.
- Landscape NetBet lockup in medium rectangles and wide portraits; stacked lockup on narrow formats.
- White bold headline, pale blue supporting headline in tall references; white offer copy with red glow/accent and a rising-arrow graphic.
- Red rounded CTA. Finnish CTA observed: `Rekisteröidy`.
- The photograph occupies the bottom of portraits, right of narrow strips and lower part of 300×250. Text occupies its own safe area.
- Legal copy observed: `18+ | Pelaathan vastuullisesti | Käyttöehdot pätevät | MGA/B2C/126/2006`. This is a transcription from the reference, **not verified current legal guidance**.
- In 320×50: introduction → offer → CTA + legal. Logo persists; photograph is absent in the final frame.
- In 300×100: introduction → offer; CTA and legal are visible in both frames.
- In 728×90: introduction/offer → CTA; logo and legal persist.
- The 300×50 static reference has no visible legal line or CTA. This is a documented reference gap, not a rule to omit required copy.

## Starting implementation vs reference fidelity

Initial templates reproduce the broad composition and measured scene delays. They are editable drafts, not pixel-perfect golden fixtures. The fallback wordmark uses text and is visibly identified as a placeholder in quality checks; the real vector/raster logo must be uploaded through Studio or the editor's logo inspector. A user-requested Outfit preset is bundled separately from the source references using [Fontsource](https://fontsource.org/fonts/outfit/about), with title/CTA 800, supporting text 600 and legal 400. Existing campaigns retain Arial or their uploaded font until that preset is selected per market. The demo hero is a browser-rendered crop of the 300×600 reference (300×210 source pixels), carries a `reference-crop` provenance flag, and always produces a draft warning. Uploading an original image replaces it across all formats in the selected market.

No UK legal copy is invented. The UK campaign starts with an empty legal field and an explicit quality warning. Its initial layout differs from FI by moving the image and aligning campaign text differently; these are proposed defaults awaiting UK references.

The observed red is estimated, not an official brand token. Text glow is an editable renderer effect with red as its initial color; exact reference matching still requires typography and per-size tuning. The offer arrow is not supplied as a standalone approved asset.
