"""One heavy HTTP operation at a time, with explicit model residency handoff."""
import gc
import threading
from fastapi import HTTPException


class ModelScheduler:
    def __init__(self):
        self.lock = threading.Lock()
        self.releases = {}
        self.resident = None

    def register(self, name, release):
        self.releases[name] = release

    def run(self, name, operation, *args):
        if not self.lock.acquire(blocking=False):
            raise HTTPException(429, 'Another local model is working. Please retry shortly.')
        try:
            if self.resident != name:
                for other, release in self.releases.items():
                    if other != name:
                        release()
                gc.collect()
                # Allocator caches must also yield VRAM before another model loads.
                try:
                    import torch
                    if torch.cuda.is_available(): torch.cuda.empty_cache()
                except (ImportError, RuntimeError):
                    pass
                self.resident = name
            return operation(*args)
        finally:
            self.lock.release()
