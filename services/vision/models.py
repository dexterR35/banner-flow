"""Pinned local discovery. HTTP inference never downloads model weights."""
import os
from pathlib import Path

QWEN_REPO = 'Qwen/Qwen2.5-VL-3B-Instruct'
QWEN_REVISION = '66285546d2b821cf421d4f5eb2576359d3770cd3'
FLORENCE_REPO = 'florence-community/Florence-2-base-ft'
FLORENCE_REVISION = '0b03b6f15a4a211370fb204aee4e7dd48887ea37'


def model_location(name):
    key = f'BANNERFLOW_{name.upper()}_MODEL'
    # An explicitly empty override disables a model, including in isolated tests.
    if key in os.environ:
        return os.environ[key], os.environ.get(f'BANNERFLOW_{name.upper()}_REVISION', '')
    if name not in {'qwen', 'florence'}:
        return None, ''
    from huggingface_hub.constants import HF_HUB_CACHE
    repo, revision = (QWEN_REPO, QWEN_REVISION) if name == 'qwen' else (FLORENCE_REPO, FLORENCE_REVISION)
    folder = Path(HF_HUB_CACHE) / ('models--' + repo.replace('/', '--')) / 'snapshots' / revision
    return str(folder), revision


def memory_status():
    """Physical RAM is distinct from swap; this CPU profile keeps a reserve for the app."""
    try:
        import psutil
        memory = psutil.virtual_memory()
        total, available = memory.total, memory.available
    except ImportError:
        try:
            total = os.sysconf('SC_PHYS_PAGES') * os.sysconf('SC_PAGE_SIZE')
            available = os.sysconf('SC_AVPHYS_PAGES') * os.sysconf('SC_PAGE_SIZE')
        except (ValueError, OSError, AttributeError):
            return {'totalGB': None, 'availableGB': None}
    return {'totalGB': round(total / 1024**3, 1), 'availableGB': round(available / 1024**3, 1)}

# Application budgets for the bounded, unquantized 3B planner, not vendor minima.
# GPU weights stream directly to the selected device; CPU uses float32.
QWEN_PROFILES = {
    'cuda': {'minimumRAMGiB': 14, 'availableRAMGiB': 6, 'minimumVRAMGiB': 11,
             'availableVRAMGiB': 9, 'recommended': '16 GB RAM and a 12 GB CUDA GPU'},
    'cpu': {'minimumRAMGiB': 22, 'availableRAMGiB': 18, 'minimumVRAMGiB': 0,
            'availableVRAMGiB': 0, 'recommended': '24 GB RAM minimum; 32 GB recommended'},
}


def hardware_status():
    memory = memory_status()
    try:
        import torch
        devices = []
        if torch.cuda.is_available():
            for index in range(torch.cuda.device_count()):
                with torch.cuda.device(index):
                    free, total = torch.cuda.mem_get_info()
                    devices.append({'index': index, 'name': torch.cuda.get_device_name(index),
                                    'totalGiB': round(total / 1024**3, 2),
                                    'freeGiB': round(free / 1024**3, 2),
                                    'bfloat16': torch.cuda.is_bf16_supported()})
        return {'memory': memory, 'cuda': devices, 'torch': torch.__version__,
                'cudaRuntime': torch.version.cuda, 'error': None}
    except (ImportError, RuntimeError, OSError) as error:
        return {'memory': memory, 'cuda': [], 'torch': None, 'cudaRuntime': None, 'error': str(error)}


def select_qwen_profile(hardware, requested='auto'):
    """Pure device selection, independently testable on a CPU-only build machine."""
    import re
    if requested not in {'auto', 'cpu', 'cuda'} and not re.fullmatch(r'cuda:\d+', requested):
        return {'ready': False, 'message': 'BANNERFLOW_QWEN_DEVICE must be auto, cpu, cuda or cuda:N.'}
    if hardware.get('error'):
        return {'ready': False, 'message': 'Install a compatible PyTorch runtime: ' + hardware['error']}
    devices = sorted(hardware['cuda'], key=lambda d: (d['totalGiB'], d['freeGiB']), reverse=True)
    if requested.startswith('cuda:'):
        devices = [d for d in devices if d['index'] == int(requested.split(':')[1])]
    gpu = next((d for d in devices if d['totalGiB'] >= QWEN_PROFILES['cuda']['minimumVRAMGiB']), None)
    if requested.startswith('cuda') and gpu is None:
        return {'ready': False, 'message': 'Qwen CUDA profile needs a supported GPU with 12 GB VRAM and a CUDA-enabled PyTorch build.', 'requirements': QWEN_PROFILES['cuda']}
    kind = 'cuda' if gpu is not None and requested != 'cpu' else 'cpu'
    limits = QWEN_PROFILES[kind]
    ready = (hardware['memory']['totalGB'] or 0) >= limits['minimumRAMGiB']
    return {'ready': ready, 'device': f"cuda:{gpu['index']}" if kind == 'cuda' else 'cpu',
            'deviceName': gpu['name'] if kind == 'cuda' else 'CPU',
            'dtype': ('bfloat16' if gpu['bfloat16'] else 'float16') if kind == 'cuda' else 'float32',
            'requirements': limits, 'gpu': gpu if kind == 'cuda' else None,
            'message': None if ready else f"Qwen is installed; this machine does not meet the selected {kind.upper()} profile. Required: {limits['recommended']}. CUDA is selected automatically when available."}


def select_florence_profile(hardware, requested='auto'):
    """Conservative application budget for one bounded Florence-2-base-ft image."""
    import re
    requirements = {'minimumRAMGiB': 8, 'availableRAMGiB': 2,
                    'minimumVRAMGiB': 4, 'availableVRAMGiB': 2}
    if requested not in {'auto', 'cpu', 'cuda'} and not re.fullmatch(r'cuda:\d+', requested):
        return {'ready': False, 'requirements': requirements,
                'message': 'BANNERFLOW_FLORENCE_DEVICE must be auto, cpu, cuda or cuda:N.'}
    if hardware.get('error'):
        return {'ready': False, 'requirements': requirements,
                'message': 'Install a compatible PyTorch runtime: ' + hardware['error']}
    devices = sorted(hardware['cuda'], key=lambda d: (d['totalGiB'], d['freeGiB']), reverse=True)
    if requested.startswith('cuda:'):
        devices = [d for d in devices if d['index'] == int(requested.split(':')[1])]
    gpu = next((d for d in devices if d['totalGiB'] >= requirements['minimumVRAMGiB']), None)
    if requested.startswith('cuda') and gpu is None:
        return {'ready': False, 'requirements': requirements,
                'message': 'Florence CUDA needs a GPU with at least 4 GiB VRAM and CUDA-enabled PyTorch.'}
    gpu = gpu if requested != 'cpu' else None
    ready = (hardware['memory']['totalGB'] or 0) >= requirements['minimumRAMGiB']
    return {'ready': ready, 'device': f"cuda:{gpu['index']}" if gpu else 'cpu',
            'deviceName': gpu['name'] if gpu else 'CPU',
            'dtype': ('bfloat16' if gpu['bfloat16'] else 'float16') if gpu else 'float32',
            'requirements': requirements, 'gpu': gpu,
            'message': None if ready else 'Florence-2-base-ft needs at least 8 GiB physical RAM.'}
