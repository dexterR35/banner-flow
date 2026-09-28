"""Read-only source inspection. Pillow is only needed for this maintenance command."""
from pathlib import Path
from PIL import Image
import hashlib, json, shutil

root = Path(__file__).resolve().parents[1]
records = []
for path in sorted((root / 'assets').rglob('*')):
    if path.suffix.lower() not in {'.png', '.jpg', '.jpeg', '.webp', '.gif'}:
        continue
    if path.name == 'reference-contact-sheet.png':
        continue  # Existing inspection artifact, not an independent source reference.
    with Image.open(path) as image:
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        still = None
        if path.suffix.lower() == '.gif':
            # A decoded still makes reference crops deterministic in preview and export.
            still = f'frames/{digest}-0.png'
            target = root / 'public/references' / still
            target.parent.mkdir(parents=True, exist_ok=True)
            image.convert('RGBA').save(target)
        durations = []
        loop = image.info.get('loop')
        for frame in range(getattr(image, 'n_frames', 1)):
            image.seek(frame)
            durations.append(image.info.get('duration', 0))
        records.append(dict(file=path.relative_to(root / 'assets').as_posix(), width=image.width,
            height=image.height, frames=len(durations), durationsMs=durations,
            totalDurationMs=sum(durations), loop=loop, bytes=path.stat().st_size,
            sha256=digest, **({'stillFile': still} if still else {})))
    target = root / 'public/references' / path.relative_to(root / 'assets')
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(path, target)
(root / 'src/data/asset-manifest.json').write_text(json.dumps(records, indent=2) + '\n')
print(f'Inspected {len(records)} source references; originals preserved.')
