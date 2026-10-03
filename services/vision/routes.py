import asyncio
import json
from fastapi import HTTPException, Request
from .runtime import VisionRuntime

def install_vision_routes(app, runtime=None, scheduler=None):
    runtime = runtime or VisionRuntime()
    if scheduler and hasattr(runtime, 'unload'):
        scheduler.register('vision', runtime.unload)
    @app.get('/vision/capabilities')
    async def capabilities():
        return await asyncio.to_thread(runtime.capabilities)

    @app.post('/vision/media')
    async def sample_media(request: Request):
        from .media import media_frames
        data=bytearray()
        async for chunk in request.stream():
            data.extend(chunk)
            if len(data)>30*1024*1024:raise HTTPException(413,'Media exceeds 30 MB.')
        return await asyncio.to_thread(media_frames,bytes(data))

    @app.post('/vision/{operation}')
    async def infer(operation: str, request: Request):
        if operation not in {'plan','embed','ocr','reference'}:
            raise HTTPException(404, 'Unknown intelligence operation.')
        data = bytearray()
        async for chunk in request.stream():
            data.extend(chunk)
            if len(data) > 13_000_000:
                raise HTTPException(413, 'Intelligence request exceeds the preview budget.')
        try:
            payload = json.loads(data)
            if not isinstance(payload, dict):
                raise ValueError()
        except (ValueError, TypeError):
            raise HTTPException(422, 'Expected a JSON request object.')
        if await request.is_disconnected():
            raise HTTPException(499, 'Request cancelled.')
        return await asyncio.to_thread(scheduler.run, 'vision', runtime.run, operation, payload) if scheduler else await asyncio.to_thread(runtime.run, operation, payload)
