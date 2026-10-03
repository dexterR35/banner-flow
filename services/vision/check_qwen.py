"""Portable Qwen preflight; --smoke explicitly loads and exercises trained weights."""
import argparse
import base64
import io
import json
from PIL import Image
from .runtime import VisionRuntime


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--smoke', action='store_true', help='Run real inference after preflight')
    args = parser.parse_args()
    runtime = VisionRuntime()
    profile = runtime.profile('qwen')
    print(json.dumps({k: profile.get(k) for k in ('model', 'installed', 'ready', 'device', 'deviceName', 'dtype', 'requirements', 'hardware', 'message')}, indent=2))
    if not args.smoke:
        return
    if not profile['ready']:
        raise SystemExit('Resolve the reported prerequisites before running real inference.')
    asset, brief, copy = 'a'*64, 'b'*64, 'c'*64
    context = {'brief': 'Place the image beside the supplied headline.', 'briefRevisionId': brief,
               'copyRevisionId': copy, 'copy': {'headline':'WIN TODAY','subtitle':'','cta':'PLAY','legal':'18+'},
               'assetIds':[asset], 'roleBindings':{'hero':asset}, 'variants':['hero-right','hero-left'],
               'targets':[{'id':'smoke-300x250','width':300,'height':250}], 'targetPresetIds':['smoke-300x250'],
               'styleTokenSetId':'smoke-draft', 'familyId':'campaign-hero'}
    image=Image.new('RGB',(256,256),'#688bad'); encoded=io.BytesIO(); image.save(encoded,format='PNG')
    result=runtime.run('plan',{'context':context,'image':base64.b64encode(encoded.getvalue()).decode()})
    plan=json.loads(result['plan'])
    checks = {'schemaVersion':1,'briefRevisionId':brief,'copyRevisionId':copy,'copyPolicy':'preserve-exact',
              'familyId':'campaign-hero','inputAssetIds':[asset],'roleBindings':context['roleBindings'],
              'styleTokenSetId':'smoke-draft','targetPresetIds':context['targetPresetIds']}
    if any(plan.get(k)!=v for k,v in checks.items()) or not plan.get('variantPriority') or any(v not in context['variants'] for v in plan['variantPriority']):
        raise SystemExit('Inference ran, but the plan failed the smoke contract. The app will reject invalid plans.')
    print(json.dumps({'smoke':'passed','plan':plan,'provenance':result['provenance']},indent=2))


if __name__ == '__main__':
    main()
