import { migrateFiReferences } from '../core/fi-reference-migration.js';
import { useState, useEffect, useRef } from 'react';
import { initialProject } from '../data/defaults.js';
import { migrateLineSpacing } from '../core/line-spacing.js';
import { applyBlueprintCorrections } from '../core/blueprint-corrections.js';
import { loadProject, saveProject, validateProject, loadResources } from '../core/storage.js';

export function useProject() {
  const [project, setProject] = useState(null),
    [status, setStatus] = useState('Loading workspace…');
  const queue = useRef(Promise.resolve());
  const saveRevision = useRef(0);
  useEffect(() => {
    loadProject()
      .then((p) => {
        setProject(
          migrateFiReferences(
            migrateLineSpacing(
              p ? applyBlueprintCorrections(validateProject(p)) : initialProject(),
            ),
          ),
        );
        setStatus('Saving…');
      })
      .catch((e) => setStatus(`Storage error: ${e.message}`));
  }, []);
  useEffect(() => {
    if (!project) return;
    const revision = ++saveRevision.current;
    setStatus('Saving…');
    const timer = setTimeout(() => {
      queue.current = queue.current
        .catch(() => {})
        .then(() => saveProject(project))
        .then(() => {
          if (saveRevision.current === revision) setStatus('Saved locally');
        })
        .catch((e) => {
          if (saveRevision.current === revision) setStatus(`Save failed: ${e.message}`);
        });
    }, 300);
    return () => clearTimeout(timer);
  }, [project]);
  return [project, setProject, status];
}
export function useResources(campaign) {
  const key = JSON.stringify([
    campaign.heroAssetId,
    campaign.logoAssetId,
    campaign.fontAssetId,
    campaign.typography,
  ]);
  const [state, setState] = useState({ resources: null, error: null, key });
  useEffect(() => {
    let live = true;
    setState({ resources: null, error: null, key });
    loadResources(campaign)
      .then((resources) => live && setState({ resources, error: null, key }))
      .catch((error) => live && setState({ resources: null, error: error.message, key }));
    return () => {
      live = false;
    };
  }, [key]);
  return state.key === key ? state : { resources: null, error: null };
}
