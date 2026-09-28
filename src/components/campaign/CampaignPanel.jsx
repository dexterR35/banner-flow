import {
  TextField,
  TextareaField,
  Button,
  Field,
  Input,
  SelectField,
  Textarea,
  Title,
  AssetUpload,
} from '../ui/index.js';
import { SlidersHorizontal, Upload, ScanLine, Download } from 'lucide-react';

import { useWorkspace } from '../../hooks/useWorkspace.js';
import SubjectFocusPanel from './SubjectFocusPanel.jsx';
import BannerTypography from './BannerTypography.jsx';
export default function CampaignPanel() {
  const {
    project,
    campaign,
    entries,
    market,
    resources,
    busy,
    format,
    setFormat,
    changeCampaign,
    upload,
    analysis,
    analyzeSource,
    setDialog,
    subject,
  } = useWorkspace();
  return (
    <aside className="campaign-panel" aria-busy={subject.placing || undefined}>
      <div className="campaign-panel-heading">
        <span className="panel-symbol">
          <SlidersHorizontal size={18} />
        </span>
        <div>
          <Title as="h2">Campaign content</Title>
          <p>
            Shared across {entries.length} {market.id} formats
          </p>
        </div>
      </div>
      <fieldset
        className="campaign-fields"
        disabled={subject.placing}
        inert={subject.placing || undefined}
        aria-label="Campaign settings"
      >
        <TextField
          label="Campaign name"
          value={campaign.name}
          onChange={(e) => changeCampaign({ name: e.target.value })}
        />
        <div className="upload-title">
          Campaign image <span>Original asset</span>
        </div>
        <label className="upload-zone">
          <Upload size={19} />
          <strong>
            {campaign.heroAssetId ? 'Replace campaign image' : 'Upload campaign image'}
          </strong>
          <small>PNG, JPG, WebP · up to 30 MB</small>
          <Input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => {
              upload(e.target.files[0], 'hero');
              e.target.value = '';
            }}
          />
        </label>
        <p className="asset-caption">
          {campaign.heroAssetId
            ? project.assets.find((a) => a.id === campaign.heroAssetId)?.name
            : 'Using a reference crop for this draft.'}
        </p>
        <SubjectFocusPanel />
        <div className="content-section-label">
          <span>Copy & messaging</span>
          <span>{market.id}</span>
        </div>
        <BannerTypography campaign={campaign} onChange={changeCampaign} />
        <AssetUpload
          label={market.logoLabel || 'NetBet logo'}
          assetName={project.assets.find((asset) => asset.id === campaign.logoAssetId)?.name}
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          hint="Logo image for this market · SVG or transparent PNG recommended."
          onUpload={(file) => upload(file, 'logo')}
        />
        <TextareaField
          label="Headline"
          rows={3}
          value={campaign.headline}
          onChange={(e) => changeCampaign({ headline: e.target.value })}
        />
        <TextareaField
          label="Offer / subtitle"
          rows={2}
          value={campaign.subtitle}
          onChange={(e) => changeCampaign({ subtitle: e.target.value })}
        />
        <div className="field-grid accent-field">
          <TextField
            label="Accent word"
            placeholder="Optional"
            value={campaign.accentWord}
            onChange={(e) => changeCampaign({ accentWord: e.target.value })}
          />
          <TextField
            label="Color"
            type="color"
            value={campaign.accentColor}
            onChange={(e) => changeCampaign({ accentColor: e.target.value })}
          />
        </div>
        <TextField
          label="Call to action"
          value={campaign.cta}
          onChange={(e) => changeCampaign({ cta: e.target.value })}
        />
        <Field
          label={`${market.id} legal line`}
          hint={
            market.legalStatus === 'reference transcription'
              ? 'Transcribed from the reference. Needs review.'
              : 'Add approved copy for this market.'
          }
        >
          <Textarea
            rows={3}
            placeholder="Enter market-specific legal copy"
            value={campaign.legal}
            onChange={(e) => changeCampaign({ legal: e.target.value })}
          />
        </Field>
        <details className="brand-assets">
          <summary>Custom font & image analysis</summary>
          <AssetUpload
            label="Production font"
            assetName={project.assets.find((asset) => asset.id === campaign.fontAssetId)?.name}
            accept=".woff,.woff2,.ttf,.otf"
            hint="Uploading a font switches this market to its original layer weights."
            onUpload={(file) => upload(file, 'font')}
          />
          <Button variant="subtle" disabled={!resources || !!busy} onClick={analyzeSource}>
            <ScanLine size={15} /> Analyze source image
          </Button>
          {analysis && (
            <p className="analysis-result">
              {analysis.engine} · {analysis.width} × {analysis.height}
              <br />
              Luminance {analysis.luminance}/255 · edge variance {analysis.edgeVariance}
            </p>
          )}
        </details>
        <div className="export-panel">
          <div className="row">
            <SelectField
              label="Static format"
              value={format}
              onChange={(e) => setFormat(e.target.value)}
            >
              <option value="png">PNG · lossless</option>
              <option value="jpg">JPEG</option>
              <option value="webp">WebP</option>
            </SelectField>
            <span className="micro">+ GIF</span>
          </div>
          <Button
            variant="export"
            disabled={!resources || !!busy}
            onClick={() => setDialog('export')}
          >
            <Download size={16} /> Export campaign <span>{entries.length}</span>
          </Button>
          <small>Exact dimensions · ZIP + review manifest</small>
        </div>
      </fieldset>
    </aside>
  );
}
