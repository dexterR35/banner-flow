"""Local inference contracts; trained checkpoint tests are explicit opt-ins."""
import base64
import io
import os
import shutil
import subprocess
import tempfile
from pathlib import Path
import unittest
from unittest.mock import patch
from PIL import Image, ImageDraw, ImageFont
from fastapi.testclient import TestClient
from fastapi import HTTPException
from services.sam3_server import create_app
from services.vision.runtime import VisionRuntime, decode_image
from services.vision.media import media_frames

class FakeSam:
    def health(self):return {'ready':False}
class FakeVision:
    def capabilities(self):return {'qwen':{'ready':False},'siglip':{'ready':False},'florence':{'ready':False},'ocr':{'ready':False}}
    def run(self,op,payload):return {'operation':op,'keys':sorted(payload)}
class VisionTests(unittest.TestCase):
    def test_florence_regions_are_model_only_bounded_and_profile_pinned(self):
        data=io.BytesIO();Image.new('RGB',(100,80),'white').save(data,format='PNG')
        runtime=VisionRuntime()
        profile={'profileId':'a'*64,'contract':{'revision':'b'*40},'device':'cpu'}
        answers={'<OCR_WITH_REGION>':{'quad_boxes':[[10,10,30,10,30,20,10,20],[-5,5,8,5,8,15,-5,15]],'labels':['Offer','Edge']},
                 '<OD>':{'bboxes':[[20,20,110,70]],'labels':['person']}}
        with patch.object(runtime,'load',return_value=profile), patch.object(runtime,'florence_task',side_effect=lambda image,task,**kwargs:answers[task]):
            result=runtime.run('reference',{'image':base64.b64encode(data.getvalue()).decode(),'profileId':'a'*64})
            self.assertEqual([region['text'] for region in result['textRegions']],['Offer','Edge'])
            self.assertAlmostEqual(result['textRegions'][1]['box']['x'],0)
            self.assertAlmostEqual(result['objects'][0]['box']['x']+result['objects'][0]['box']['width'],1)
            self.assertEqual(result['provenance']['tasks'],['<OCR_WITH_REGION>','<OD>'])
            with self.assertRaises(HTTPException):
                runtime.run('reference',{'image':base64.b64encode(data.getvalue()).decode(),'profileId':'c'*64})

    def test_florence_profile_selects_cuda_when_suitable_and_cpu_otherwise(self):
        from services.vision.models import select_florence_profile
        hardware={'memory':{'totalGB':16,'availableGB':9},'cuda':[
            {'index':0,'name':'GPU','totalGiB':6,'freeGiB':5,'bfloat16':False}], 'error':None}
        self.assertEqual(select_florence_profile(hardware)['device'],'cuda:0')
        self.assertEqual(select_florence_profile(hardware,'cpu')['device'],'cpu')
        hardware['cuda']=[]
        self.assertEqual(select_florence_profile(hardware)['device'],'cpu')
        self.assertFalse(select_florence_profile(hardware,'cuda')['ready'])

    def test_local_origins_bounds_and_operation_allowlist(self):
        client=TestClient(create_app(FakeSam(),vision=FakeVision()),base_url='http://127.0.0.1:5181')
        self.assertFalse(client.get('/vision/capabilities').json()['qwen']['ready'])
        self.assertEqual(client.post('/vision/plan',json={'context':{}}).json()['operation'],'plan')
        self.assertEqual(client.post('/vision/reference',json={'image':'fixture'}).json()['operation'],'reference')
        self.assertEqual(client.post('/vision/execute',json={}).status_code,404)
        self.assertEqual(client.post('/vision/plan',json=[]).status_code,422)
        self.assertEqual(client.post('/vision/plan',json={},headers={'origin':'https://untrusted.example'}).status_code,403)
        self.assertEqual(client.post('/vision/ocr',content=b'x'*13_000_001).status_code,413)
    def test_unavailable_models_do_not_load_or_download(self):
        with patch.dict(os.environ,{'BANNERFLOW_QWEN_MODEL':'','BANNERFLOW_SIGLIP_MODEL':'','BANNERFLOW_FLORENCE_MODEL':''}):
            runtime=VisionRuntime();self.assertFalse(runtime.profile('qwen')['ready']);self.assertFalse(runtime.profile('siglip')['ready']);self.assertFalse(runtime.profile('florence')['ready']);self.assertIsNone(runtime.model)
            with self.assertRaises(HTTPException):runtime.load('qwen')
            with self.assertRaises(HTTPException):runtime.load('florence')
    def test_decode_rejects_urls_nonimages_and_large_previews(self):
        for value in ['https://untrusted/image.png','a'*12_000_001,base64.b64encode(b'not an image').decode()]:
            with self.assertRaises(HTTPException):decode_image(value)
    @unittest.skipUnless(shutil.which('tesseract'),'Local OCR unavailable')
    def test_real_ocr_extracts_known_text_from_local_fixture(self):
        image=Image.new('RGB',(800,180),'white');draw=ImageDraw.Draw(image)
        font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',48)
        draw.text((24,40),'BANNERFLOW 2026',font=font,fill='black');buffer=io.BytesIO();image.save(buffer,format='PNG')
        result=VisionRuntime().run('ocr',{'image':base64.b64encode(buffer.getvalue()).decode(),'language':'eng'})
        text=' '.join(r['text'] for r in result['ocr']);self.assertIn('BANNERFLOW',text);self.assertIn('2026',text)
        for region in result['ocr']:
            b=region['box'];self.assertLessEqual(b['x']+b['width'],1);self.assertLessEqual(b['y']+b['height'],1)
    def test_gif_frame_delays_and_original_bytes_are_preserved(self):
        frames=[Image.new('RGB',(40,30),c) for c in ['red','blue','green']];buffer=io.BytesIO();frames[0].save(buffer,format='GIF',save_all=True,append_images=frames[1:],duration=[100,230,410],loop=0)
        source=buffer.getvalue();result=media_frames(source);self.assertEqual(result['durationMs'],740);self.assertEqual([f['timestampMs'] for f in result['frames']],[0,100,330]);self.assertEqual([f['durationMs'] for f in result['frames']],[100,230,410]);self.assertEqual(source,buffer.getvalue())
    @unittest.skipUnless(shutil.which('ffmpeg') and shutil.which('ffprobe'),'Local video decoders unavailable')
    def test_real_video_frames_preserve_index_timestamps(self):
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/'fixture.mp4'
            subprocess.run(['ffmpeg','-v','error','-f','lavfi','-i','testsrc=size=96x64:rate=5','-t','1','-c:v','mpeg4','-pix_fmt','yuv420p',str(path)],check=True,capture_output=True)
            result=media_frames(path.read_bytes(),count=3)
            self.assertEqual(result['codec'],'mpeg4')
            self.assertEqual([f['frameIndex'] for f in result['frames']],[0,2,4])
            self.assertEqual([f['timestampMs'] for f in result['frames']],[0,400,800])
            for frame in result['frames']:
                image=Image.open(io.BytesIO(base64.b64decode(frame['image'])))
                self.assertEqual(image.format,'PNG')
    def test_final_gif_delay_cannot_exceed_duration_budget(self):
        image=Image.new('RGB',(10,10),'red');data=io.BytesIO();image.save(data,format='GIF',duration=120010)
        with self.assertRaises(HTTPException):media_frames(data.getvalue())
    @unittest.skipUnless(os.environ.get('BANNERFLOW_REAL_QWEN')=='1','Trained Qwen checkpoint not configured for smoke testing')
    def test_real_qwen_checkpoint(self):
        runtime=VisionRuntime();self.assertTrue(runtime.profile('qwen')['ready']);runtime.load('qwen');self.assertIsNotNone(runtime.model)
    @unittest.skipUnless(os.environ.get('BANNERFLOW_REAL_SIGLIP')=='1','Trained SigLIP NaFlex checkpoint not configured for smoke testing')
    def test_real_siglip_checkpoint(self):
        result=VisionRuntime().run('embed',{'text':'a football player'});self.assertGreater(result['dimension'],0);self.assertAlmostEqual(sum(v*v for v in result['vector']),1,places=4)

class QwenSetupTests(unittest.TestCase):
    def fixture(self, folder):
        import json, struct
        root = Path(folder)
        (root/'config.json').write_text(json.dumps({'model_type':'qwen2_5_vl','hidden_size':2048}))
        for name in ('tokenizer.json','tokenizer_config.json','preprocessor_config.json','chat_template.json'):
            (root/name).write_text('{}')
        header = json.dumps({'weight':{'dtype':'F32','shape':[1],'data_offsets':[0,4]}}).encode()
        (root/'model.safetensors').write_bytes(struct.pack('<Q',len(header))+header+b'\0'*4)
        return {'BANNERFLOW_QWEN_MODEL': folder, 'BANNERFLOW_QWEN_REVISION': 'a'*40}

    def test_ram_upgrade_enables_installed_profile_without_loading(self):
        with tempfile.TemporaryDirectory() as folder, patch.dict(os.environ,self.fixture(folder)), patch('services.vision.runtime.importlib.metadata.version',return_value='5.17.0'):
            runtime = VisionRuntime()
            with patch('services.vision.runtime.hardware_status',return_value={'memory':{'totalGB':16,'availableGB':12},'cuda':[],'torch':'fixture','error':None}):
                profile=runtime.profile('qwen')
                self.assertTrue(profile['installed']); self.assertFalse(profile['ready'])
                with self.assertRaises(HTTPException): runtime.load('qwen')
                self.assertIsNone(runtime.model)
            with patch('services.vision.runtime.hardware_status',return_value={'memory':{'totalGB':32,'availableGB':26},'cuda':[],'torch':'fixture','error':None}):
                self.assertTrue(runtime.profile('qwen')['ready'])
                self.assertIsNone(runtime.model)
            with patch('services.vision.runtime.hardware_status',return_value={'memory':{'totalGB':32,'availableGB':12},'cuda':[],'torch':'fixture','error':None}):
                with self.assertRaisesRegex(HTTPException,'available RAM'): runtime.load('qwen')
                self.assertIsNone(runtime.model)

    def test_truncated_weights_and_missing_shards_are_not_reported_installed(self):
        with tempfile.TemporaryDirectory() as folder, patch.dict(os.environ,self.fixture(folder)), patch('services.vision.runtime.importlib.metadata.version',return_value='5.17.0'):
            p=Path(folder)/'model.safetensors'; p.write_bytes(p.read_bytes()[:-1])
            self.assertFalse(VisionRuntime().profile('qwen')['ready'])
            (Path(folder)/'model.safetensors.index.json').write_text('{"weight_map":{"x":"missing.safetensors"}}')
            self.assertIn('incomplete',VisionRuntime().profile('qwen')['message'])

    def test_explicit_disable_and_pinned_default_discovery(self):
        from services.vision.models import model_location, QWEN_REVISION
        with patch.dict(os.environ,{'BANNERFLOW_QWEN_MODEL':''}):
            self.assertEqual(model_location('qwen')[0],'')
        with patch.dict(os.environ,{},clear=True):
            path, revision=model_location('qwen')
            self.assertTrue(path.endswith('/snapshots/'+QWEN_REVISION)); self.assertEqual(revision,QWEN_REVISION)

    def test_scheduler_releases_other_models_and_rejects_overlapping_jobs(self):
        from services.vision.scheduler import ModelScheduler
        scheduler=ModelScheduler(); events=[]
        scheduler.register('sam',lambda:events.append('unload-sam'))
        scheduler.register('vision',lambda:events.append('unload-vision'))
        scheduler.run('sam',lambda:events.append('sam'))
        def planning():
            events.append('qwen')
            with self.assertRaises(HTTPException) as error: scheduler.run('sam',lambda:None)
            self.assertEqual(error.exception.status_code,429)
        scheduler.run('vision',planning)
        self.assertEqual(events,['unload-vision','sam','unload-sam','qwen'])
        scheduler.run('sam',lambda:events.append('sam-again'))
        self.assertEqual(events[-2:],['unload-vision','sam-again'])


    def test_portable_cuda_cpu_and_explicit_device_profiles(self):
        from services.vision.models import select_qwen_profile
        hardware={'memory':{'totalGB':16,'availableGB':10},'cuda':[
            {'index':0,'name':'Small GPU','totalGiB':8,'freeGiB':7,'bfloat16':False},
            {'index':1,'name':'CUDA GPU','totalGiB':12,'freeGiB':11,'bfloat16':True}], 'error':None}
        selected=select_qwen_profile(hardware)
        self.assertTrue(selected['ready']); self.assertEqual(selected['device'],'cuda:1'); self.assertEqual(selected['dtype'],'bfloat16')
        hardware['cuda'][1]['bfloat16']=False
        self.assertEqual(select_qwen_profile(hardware)['dtype'],'float16')
        self.assertFalse(select_qwen_profile(hardware,'cuda:0')['ready'])
        self.assertFalse(select_qwen_profile(hardware,'cuda:99')['ready'])
        self.assertFalse(select_qwen_profile(hardware,'invalid')['ready'])
        self.assertFalse(select_qwen_profile(hardware,'cpu')['ready'])
        hardware['memory']['totalGB']=32; hardware['cuda']=hardware['cuda'][:1]
        selected=select_qwen_profile(hardware)
        self.assertTrue(selected['ready']); self.assertEqual(selected['device'],'cpu')
        self.assertEqual(selected['dtype'],'float32')
        hardware['cuda']=[]
        self.assertFalse(select_qwen_profile(hardware,'cuda')['ready'])

    def test_cuda_loader_streams_to_selected_device_and_moves_multimodal_inputs(self):
        import torch
        from unittest.mock import MagicMock
        from services.vision.models import select_qwen_profile
        hardware={'memory':{'totalGB':16,'availableGB':10},'cuda':[
            {'index':1,'name':'CUDA fixture','totalGiB':12,'freeGiB':11,'bfloat16':True}], 'error':None}
        profile={**select_qwen_profile(hardware),'profileId':'fixture','hardware':hardware,'contract':{}}
        inputs=MagicMock(); inputs.input_ids=torch.tensor([[1,2]])
        inputs.to.return_value={'input_ids':inputs.input_ids}
        class Batch(dict):
            input_ids=torch.tensor([[1,2]])
            def to(self, device): self.device_used=device; return self
        batch=Batch(input_ids=torch.tensor([[1,2]]))
        processor=MagicMock(); processor.apply_chat_template.return_value=batch
        processor.batch_decode.return_value=['{}']
        model=MagicMock(); model.eval.return_value=model; model.device='cuda:1'
        model.generate.return_value=torch.tensor([[1,2,3]])
        data=io.BytesIO(); Image.new('RGB',(32,32)).save(data,format='PNG')
        runtime=VisionRuntime()
        with patch.object(runtime,'profile',return_value=profile), patch('services.vision.runtime.model_location',return_value=('/fixture','a'*40)), patch('transformers.AutoProcessor.from_pretrained',return_value=processor), patch('transformers.Qwen2_5_VLForConditionalGeneration.from_pretrained',return_value=model) as loader:
            result=runtime.plan({'context':{},'image':base64.b64encode(data.getvalue()).decode()})
            self.assertEqual(loader.call_args.kwargs['device_map'],{'':'cuda:1'})
            self.assertEqual(loader.call_args.kwargs['dtype'],torch.bfloat16)
            self.assertTrue(loader.call_args.kwargs['local_files_only'])
            self.assertFalse(loader.call_args.kwargs['trust_remote_code'])
            self.assertEqual(batch.device_used,'cuda:1')
            self.assertEqual(result['plan'],'{}')
            self.assertEqual(model.generate.call_args.kwargs['max_new_tokens'],2048)
            self.assertEqual(model.generate.call_args.kwargs['max_time'],480)
        runtime.unload()
        self.assertIsNone(runtime.model)
        profile['gpu']['freeGiB']=4
        with patch.object(runtime,'profile',return_value=profile):
            with self.assertRaisesRegex(HTTPException,'free GPU memory'): runtime.load('qwen')

    def test_real_qwen_multimodal_cpu_generation_with_tiny_random_weights(self):
        import torch
        from transformers import Qwen2_5_VLConfig, Qwen2_5_VLForConditionalGeneration
        torch.set_num_threads(2)
        config=Qwen2_5_VLConfig(
            text_config={'vocab_size':128,'hidden_size':32,'intermediate_size':64,'num_hidden_layers':2,
                         'num_attention_heads':2,'num_key_value_heads':2,'max_position_embeddings':128,
                         'bos_token_id':10,'eos_token_id':11,'pad_token_id':0,
                         'rope_parameters':{'rope_type':'default','rope_theta':1000000.0,'mrope_section':[2,2,4]}},
            vision_config={'depth':2,'hidden_size':32,'intermediate_size':64,'num_heads':2,'out_hidden_size':32,
                           'patch_size':14,'temporal_patch_size':2,'spatial_merge_size':2,'window_size':28,'fullatt_block_indexes':[1]},
            image_token_id=3,video_token_id=4,vision_start_token_id=1,vision_end_token_id=2)
        model=Qwen2_5_VLForConditionalGeneration(config).eval()
        tokens=torch.tensor([[10,1,3,3,3,3,2,5]])
        with torch.inference_mode():
            output=model.generate(input_ids=tokens,attention_mask=torch.ones_like(tokens),
                                  pixel_values=torch.randn(16,3*2*14*14),image_grid_thw=torch.tensor([[1,4,4]]),
                                  max_new_tokens=2,do_sample=False)
        self.assertGreater(output.shape[1],tokens.shape[1])
        self.assertTrue(torch.equal(output[:,:tokens.shape[1]],tokens))
