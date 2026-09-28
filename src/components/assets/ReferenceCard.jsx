import { Card, CardBody } from '../ui/index.js';
import { ArrowUpRight } from 'lucide-react';

export default function ReferenceCard({ asset }) {
  return (
    <Card className="reference-card">
      <CardBody>
        <img
          src={`/references/${asset.file}`}
          alt={`${asset.file} reference ${asset.width} by ${asset.height}`}
          loading="lazy"
        />
      </CardBody>
      <strong>{asset.file}</strong>
      <p>
        {asset.width} × {asset.height} ·{' '}
        {asset.frames > 1 ? `${asset.frames} frames` : 'Static PNG'}
      </p>
      {asset.frames > 1 && (
        <small>{asset.durationsMs.map((d) => `${d / 1000}s`).join(' / ')} · loops forever</small>
      )}
      <a href={`/references/${asset.file}`} target="_blank" rel="noreferrer">
        Open original <ArrowUpRight size={13} />
      </a>
    </Card>
  );
}
