"""Read-only source inspection. Pillow is only needed for this maintenance command."""
from pathlib import Path
from PIL import Image
import hashlib, json, shutil

root = Path(__file__).resolve().parents[1]
records = []
for path in sorted((root / 'assets').rglob('*')):
    if path.suffix.lower() not in {'.png', '.jpg', '.jpeg', '.webp', '.gif'}:
        continue
    with Image.open(path) as image:
        durations = []
        loop = image.info.get('loop')
        for frame in range(getattr(image, 'n_frames', 1)):
            image.seek(frame)
            durations.append(image.info.get('duration', 0))
        records.append(dict(file=str(path.relative_to(root / 'assets')), width=image.width,
            height=image.height, frames=len(durations), durationsMs=durations,
            totalDurationMs=sum(durations), loop=loop, bytes=path.stat().st_size,
            sha256=hashlib.sha256(path.read_bytes()).hexdigest()))
    target = root / 'public/references' / path.relative_to(root / 'assets')
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(path, target)
(root / 'src/data/asset-manifest.json').write_text(json.dumps(records, indent=2) + '\n')
print(f'Inspected {len(records)} source references; originals preserved.')
