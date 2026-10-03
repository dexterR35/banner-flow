import { analyzeAsset } from './intelligence.js';
import { subjectServiceStatus } from '../subject-service.js';

const wholeImage = { x: 0, y: 0, width: 1, height: 1 };
function union(boxes) {
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  return {
    x,
    y,
    width: Math.max(...boxes.map((b) => b.x + b.width)) - x,
    height: Math.max(...boxes.map((b) => b.y + b.height)) - y,
  };
}
/** Evidence is frozen in the batch; automatic analysis never edits the campaign or original. */
export async function prepareGeneration(
  campaign,
  correction,
  { signal, onProgress = () => {}, automatic = true, capabilities } = {},
) {
  const asset = { id: campaign.heroAssetId, kind: 'hero' };
  const selected = campaign.subjectFocus?.assetId === asset.id ? campaign.subjectFocus : null;
  const evidence = {
    focus: correction?.value?.focal || selected?.box || null,
    focusSource: correction?.value?.focal ? 'asset-correction' : selected ? selected.source : null,
    observations: {},
    notices: [],
  };
  if (automatic) {
    if (!capabilities?.florence?.ready)
      throw new Error(
        capabilities?.florence?.message || 'Florence-2 is required by the Analyze image node.',
      );
    onProgress('Analyzing image with Florence-2…');
    const { result } = await analyzeAsset(asset, 'florence', { signal });
    evidence.observations.florence = result;
    // Pixel palette is a separate measurement, never a replacement for Florence regions.
    try {
      const { result: visual } = await analyzeAsset(asset, 'visual', { signal });
      evidence.observations.visual = visual;
    } catch (error) {
      signal?.throwIfAborted();
      evidence.notices.push(`visual: ${error.message}`);
    }
    if (!evidence.focus) {
      signal?.throwIfAborted();
      try {
        if ((await subjectServiceStatus(signal)).ready) {
          onProgress('Finding the subject with SAM 3…');
          const { result: subjects } = await analyzeAsset(asset, 'subjects', {
            signal,
            query: campaign.subjectQuery || 'person',
          });
          evidence.observations.subjects = subjects;
          if (subjects?.subjects?.length) {
            // Retain all detected people; an explicit selected focus always takes precedence.
            const people = subjects.subjects.filter((s) => !/face/i.test(s.label));
            evidence.focus = union((people.length ? people : subjects.subjects).map((s) => s.box));
            evidence.focusSource = 'sam3';
          }
        }
      } catch (error) {
        signal?.throwIfAborted();
        evidence.notices.push(`subjects: ${error.message}`);
      }
    }
  }
  if (!evidence.focus) {
    evidence.focus = wholeImage;
    evidence.focusSource = 'whole-image-fallback';
  }
  const protectedRegions = correction?.value?.protectedRegions || [];
  if (protectedRegions.length) evidence.focus = union([evidence.focus, ...protectedRegions]);
  return evidence;
}
