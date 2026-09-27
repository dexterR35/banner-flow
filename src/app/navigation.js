import { LayoutGrid, Layers, Images } from 'lucide-react';
export const workspaceNavigation = [
  {
    id: 'campaign',
    path: '/campaign',
    icon: LayoutGrid,
    label: 'Campaign studio',
    short: 'Studio',
  },
  {
    id: 'blueprints',
    path: '/blueprints',
    icon: Layers,
    label: 'Blueprint library',
    short: 'Blueprints',
  },
  { id: 'assets', path: '/assets', icon: Images, label: 'Assets & references', short: 'Assets' },
];
