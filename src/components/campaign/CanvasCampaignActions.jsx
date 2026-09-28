import { Button } from '../ui/index.js';
import { useWorkspace } from '../../hooks/useWorkspace.js';
import AutoPlaceSubject from './AutoPlaceSubject.jsx';

export default function CanvasCampaignActions() {
  const { campaign, market, resources, busy, changeCampaign, matchBlueprints, arrangeAll } =
    useWorkspace();
  const disabled = !resources || !!busy;
  return (
    <div
      className="canvas-campaign-actions"
      role="group"
      aria-label={`${market.id} canvas actions`}
    >
      <AutoPlaceSubject />
      <Button
        variant="secondary"
        className="image-fade-action"
        aria-label="Image fade"
        aria-pressed={campaign.imageFadeEnabled !== false}
        onClick={() => changeCampaign({ imageFadeEnabled: campaign.imageFadeEnabled === false })}
        title={`Turn image fades ${campaign.imageFadeEnabled === false ? 'on' : 'off'} for all ${market.id} banners`}
        disabled={disabled}
      >
        Fade: {campaign.imageFadeEnabled === false ? 'Off' : 'On'}
      </Button>
      <Button
        variant="secondary"
        className="match-blueprints-action"
        aria-pressed={campaign.keepBlueprintBoxes === true}
        onClick={() =>
          campaign.keepBlueprintBoxes
            ? changeCampaign({ keepBlueprintBoxes: false })
            : matchBlueprints()
        }
        title={`Keep ${market.id} banners aligned to their blueprint boxes`}
        disabled={disabled}
      >
        Match blueprints
      </Button>
      <Button
        variant="secondary"
        className="arrange-now-action"
        aria-pressed={campaign.autoArrange !== false}
        onClick={() => {
          const enabled = campaign.autoArrange === false;
          changeCampaign({ autoArrange: enabled });
          if (enabled) arrangeAll();
        }}
        title={`Automatically arrange ${market.id} banners${campaign.keepBlueprintBoxes ? ' inside the fixed blueprint boxes' : ''}`}
        disabled={disabled}
      >
        Arrange now
      </Button>
    </div>
  );
}
