import { Button } from '../ui/index.js';
import { Maximize2, Film, LoaderCircle, Download } from 'lucide-react';
import { resolveBanner } from '../../data/defaults.js';
import BannerPreview from '../banner/BannerPreview.jsx';
import GifParts from './GifParts.jsx';

/** One artboard on the shared Studio surface; output pixels keep their native dimensions. */
export default function BannerCard({
  entry,
  banner,
  campaign,
  resources,
  busy = false,
  onEdit,
  onExport,
  onSelect,
  onSelectPart,
  selected = false,
  children,
}) {
  const bp = resolveBanner(entry, banner);
  return (
    <article
      className={`banner-card banner-artboard ${bp.mode === 'animated' ? 'gif-artboard-group' : ''} ${selected ? 'is-selected' : ''}`}
      aria-label={`${bp.width} by ${bp.height} artboard`}
      style={{
        '--artboard-width': `${bp.width}px`,
        '--artboard-ratio': `${bp.width} / ${bp.height}`,
      }}
    >
      <div className="artboard-heading">
        <Button
          variant="plain"
          className="artboard-move-handle"
          data-artboard-move={entry.id}
          aria-label={`Move artboard ${bp.width}x${bp.height}`}
          title="Drag to arrange artboards"
          disabled={busy}
          onClick={onSelect}
        >
          {bp.width} <span>×</span> {bp.height}
          {entry.variantLabel ? ` · ${entry.variantLabel}` : ''}
        </Button>
        <div className="artboard-actions">
          <Button
            variant="icon"
            title="Open focused editor"
            aria-label={`Edit banner ${bp.width}x${bp.height}`}
            disabled={!resources || busy}
            onClick={onEdit}
          >
            <Maximize2 size={13} />
          </Button>
          {bp.mode === 'animated' && (
            <span className="artboard-gif" title="Animated GIF">
              <Film size={12} /> GIF · Main
            </span>
          )}
          <Button
            variant="icon"
            title={`Export ${bp.width}x${bp.height}`}
            aria-label={`Export ${bp.width}x${bp.height}`}
            disabled={!resources || busy}
            onClick={() => onExport(bp)}
          >
            <Download size={13} />
          </Button>
        </div>
      </div>
      {selected ? (
        <div className="artboard-preview selected-artboard-preview">{children}</div>
      ) : (
        <Button
          variant="plain"
          className="artboard-preview"
          aria-label={`Select banner ${bp.width}x${bp.height}`}
          onClick={onSelect}
          disabled={!resources || busy}
        >
          {resources ? (
            <BannerPreview blueprint={bp} campaign={campaign} resources={resources} />
          ) : (
            <LoaderCircle className="spin" />
          )}
          <span className="artboard-edit">Select banner</span>
        </Button>
      )}
      <GifParts
        blueprint={bp}
        campaign={campaign}
        resources={resources}
        disabled={busy}
        onSelectPart={onSelectPart}
      />
    </article>
  );
}
