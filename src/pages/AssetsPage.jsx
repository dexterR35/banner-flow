import { Button, EmptyState, InfoCard, Title } from '../components/ui/index.js';
import ReferenceCard from '../components/assets/ReferenceCard.jsx';
import { BookOpen, Images, ArrowRight, Image as ImageIcon } from 'lucide-react';
import Page from '../layouts/Page.jsx';
import WorkspacePageHeader from '../components/workspace/WorkspacePageHeader.jsx';
import { useWorkspace } from '../hooks/useWorkspace.js';
import inventory from '../data/asset-manifest.json';

export default function AssetsPage() {
  const { project, setView } = useWorkspace();
  return (
    <Page>
      <WorkspacePageHeader
        title="Assets & references"
        description="Original files and reference evidence, kept together."
      />
      <InfoCard icon={BookOpen} title="NetBet FI and Joker5 references">
        <p>
          Joker5 includes Chest and Mask variants. Sizes use the actual image pixels, even when the
          filename differs. UK references and separate production images, logos and fonts are still
          missing. Starter artwork uses reference crops.
        </p>
      </InfoCard>
      <Title as="h2" className="section-heading">
        Reference library <span>{inventory.length} files</span>
      </Title>
      <div className="reference-grid">
        {inventory.map((asset) => (
          <ReferenceCard key={asset.file} asset={asset} />
        ))}
      </div>
      <Title as="h2" className="section-heading">
        Uploaded originals <span>{project.assets.length} assets</span>
      </Title>
      {project.assets.length ? (
        <div className="asset-list">
          {project.assets.map((a) => (
            <div key={a.id}>
              <ImageIcon size={18} />
              <strong>{a.name}</strong>
              <span>{a.kind}</span>
              <small>
                {a.width ? `${a.width} × ${a.height} · ` : ''}
                {(a.bytes / 1024).toFixed(0)} KB
              </small>
              <code>{a.id.slice(0, 12)}</code>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={Images}
          action={
            <Button variant="secondary" onClick={() => setView('campaign')}>
              Open campaign <ArrowRight size={14} />
            </Button>
          }
        >
          Upload campaign imagery, logos and fonts from the campaign panel.
        </EmptyState>
      )}
    </Page>
  );
}
