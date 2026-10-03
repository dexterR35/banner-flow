"""Explicit one-time setup: node scripts/python.js -m services.vision.download_qwen."""
from huggingface_hub import snapshot_download
from .models import QWEN_REPO, QWEN_REVISION


def main():
    print(f'Downloading {QWEN_REPO} at {QWEN_REVISION} (7.51 GB weights).', flush=True)
    folder = snapshot_download(
        QWEN_REPO, revision=QWEN_REVISION,
        allow_patterns=['*.json', '*.safetensors', 'merges.txt'],
        max_workers=2,
    )
    from .runtime import VisionRuntime
    profile = VisionRuntime().profile('qwen')
    if not profile.get('installed'):
        raise RuntimeError(profile.get('message', 'Incomplete checkpoint'))
    print(f'Installed and discovered: {folder}', flush=True)
    print(profile.get('message') or 'Qwen is ready for local planning.', flush=True)


if __name__ == '__main__':
    main()
