import { migrateFiReferences } from '../core/fi-reference-migration.js';
import { useState, useEffect } from 'react';
import { useLocation, useNavigate, useSearchParams, useMatch } from 'react-router';
import { useResources } from './useProject.js';
import {
  activeRevision,
  resolveBanner,
  createBlueprint,
  newEntry,
  campaignFor,
  PRESETS,
  uid,
  duplicateForSize,
} from '../data/defaults.js';
import { storeAsset } from '../core/storage.js';
import {
  exportSet,
  download,
  backupProject,
  importProject,
  renderOutput,
  safeName,
} from '../core/export.js';
import { qualityReport } from '../core/render.js';
import { analyzeImage } from '../core/image-analysis.js';
import { layoutKey } from '../core/auto-layout.js';
import { useAutoArrange, arrangeMarket } from './useAutoArrange.js';
import { useSubjectFocus } from './useSubjectFocus.js';
import { applyBlueprintCorrections } from '../core/blueprint-corrections.js';
import { matchMarketBlueprints } from '../core/match-blueprints.js';
import { migrateLineSpacing } from '../core/line-spacing.js';
import { saveBlueprintFade } from '../core/blueprint-fade.js';
import { saveBlueprintStandard, syncSavedBlueprintFades } from '../core/blueprint-edit.js';

export function useWorkspaceController(project, setProject, saveStatus) {
  const navigate = useNavigate(),
    location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [cloneFrom, setCloneFrom] = useState('common'),
    [filter, setFilter] = useState('all'),
    [formatQuery, setFormatQuery] = useState(''),
    [dialog, setDialog] = useState(null),
    [toast, setToast] = useState(''),
    [busy, setBusy] = useState(''),
    [format, setFormat] = useState('png'),
    [size, setSize] = useState({ width: 970, height: 250 }),
    [newMarket, setNewMarket] = useState({ id: '', name: '', locale: 'en-GB', legal: '' }),
    [analysis, setAnalysis] = useState(null),
    [review, setReview] = useState(null);
  const blueprintRoute = useMatch('/blueprints/:entryId/*');
  const editorRoute = useMatch('/campaign/:entryId/edit');
  const referenceEntry = project.blueprints.find(
    (entry) => entry.id === blueprintRoute?.params.entryId,
  );
  const editorEntry = project.blueprints.find((entry) => entry.id === editorRoute?.params.entryId);
  // The displayed banner owns the market, even with a missing or stale query string.
  // Background subject search and arrangement must use the same market as the editor.
  const routeEntry = referenceEntry || editorEntry;
  const market =
    project.markets.find((m) => m.id === routeEntry?.marketId) ||
    project.markets.find((m) => m.id === searchParams.get('market')) ||
    project.markets[0];
  const campaign = project.campaigns[market.id],
    view = location.pathname.split('/')[1] || 'campaign';
  const { resources, error } = useResources(campaign);
  const subject = useSubjectFocus(campaign, market.id, setProject, resources);
  useEffect(() => {
    if (!subject.placing)
      setProject((current) =>
        syncSavedBlueprintFades(migrateFiReferences(migrateLineSpacing(current)), market.id),
      );
  }, [project, market.id, subject.placing, setProject]);
  const entries = project.blueprints.filter((b) => b.marketId === market.id);
  const layoutPending = useAutoArrange(project, setProject, market.id, resources);
  const arranging = layoutPending && !error;
  function arrangeAll() {
    if (!resources || subject.placing) return;
    setProject((current) => arrangeMarket(current, market.id, resources));
    notify(`${entries.length} formats arranged for your current text and image.`);
  }
  function matchBlueprints() {
    if (!resources || subject.placing) return;
    setProject((current) =>
      arrangeMarket(matchMarketBlueprints(current, market.id), market.id, resources),
    );
    notify('Matched blueprint boxes. Copy, images and styling kept.');
  }
  function setMarketId(id) {
    if (routeEntry) {
      setView(referenceEntry ? 'blueprints' : 'campaign', id);
      return;
    }
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      next.set('market', id);
      return next;
    });
    setAnalysis(null);
  }
  function setView(page, id = market.id) {
    navigate(`/${page}?market=${encodeURIComponent(id)}`);
  }
  function entryUrl(id, page, suffix = '') {
    const entry = project.blueprints.find((item) => item.id === id);
    return `/${page}/${encodeURIComponent(id)}${suffix}?market=${encodeURIComponent(entry?.marketId || market.id)}`;
  }
  const openEditor = (id) => {
    if (!subject.placing) navigate(entryUrl(id, 'campaign', '/edit'));
  };
  const openBlueprintEditor = (id) => {
    if (!subject.placing) navigate(entryUrl(id, 'blueprints', '/edit'));
  };
  const openBlueprint = (id) => navigate(entryUrl(id, 'blueprints'));
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 4500);
    return () => clearTimeout(timer);
  }, [toast]);
  const notify = (text) => setToast(text);
  const changeCampaign = (patch) => {
    if (subject.placing) return;
    setProject((p) => ({
      ...p,
      campaigns: { ...p.campaigns, [market.id]: { ...p.campaigns[market.id], ...patch } },
    }));
  };
  async function run(label, fn) {
    setBusy(label);
    try {
      await fn();
    } catch (e) {
      notify(e.message);
    } finally {
      setBusy('');
    }
  }
  async function upload(file, kind) {
    if (!file || subject.placing) return;
    await run('Saving original asset…', async () => {
      const asset = await storeAsset(file, kind);
      setProject((p) => ({
        ...p,
        assets: p.assets.some((a) => a.id === asset.id) ? p.assets : [...p.assets, asset],
        campaigns: {
          ...p.campaigns,
          [market.id]: {
            ...p.campaigns[market.id],
            [`${kind}AssetId`]: asset.id,
            ...(kind === 'font' ? { typography: 'original' } : {}),
            ...(kind === 'hero' ? { subjectFocus: null, subjectSearch: null } : {}),
          },
        },
      }));
      if (kind === 'hero') subject.placeUpload(asset.id);
      setAnalysis(null);
      notify(`${file.name} added. Original preserved.`);
    });
  }
  function addSize() {
    if (subject.placing) return;
    if (
      !Number.isInteger(size.width) ||
      !Number.isInteger(size.height) ||
      size.width < 32 ||
      size.height < 32 ||
      size.width > 2048 ||
      size.height > 2048
    ) {
      notify('Use whole dimensions between 32 and 2048 pixels.');
      return;
    }
    const source = project.blueprints.find((e) => e.id === cloneFrom);
    const bp = source
      ? duplicateForSize(activeRevision(source).blueprint, market.id, size.width, size.height)
      : createBlueprint(market.id, size.width, size.height);
    if (entries.some((e) => e.id === bp.id)) {
      notify('This market already has that size.');
      return;
    }
    const entry = newEntry(bp);
    setProject((p) => ({
      ...p,
      blueprints: [...p.blueprints, entry],
      banners: {
        ...p.banners,
        [entry.id]: {
          blueprintVersionId: entry.activeVersionId,
          override: null,
          history: [],
          layoutKey: layoutKey(p.campaigns[market.id]),
        },
      },
    }));
    setDialog(null);
    setFilter('all');
    setFormatQuery('');
    navigate(
      `/blueprints/${encodeURIComponent(entry.id)}/edit?market=${encodeURIComponent(market.id)}`,
    );
    notify('Blueprint created. Arrange the boxes, then save to update Studio.');
  }
  function addMarket() {
    if (subject.placing) return;
    const id = newMarket.id.trim().toUpperCase();
    if (!/^[A-Z0-9-]{2,8}$/.test(id) || !newMarket.name.trim()) {
      notify('Enter a market name and a 2–8 character market code.');
      return;
    }
    if (project.markets.some((m) => m.id === id)) {
      notify('Market code already exists.');
      return;
    }
    const m = {
        ...newMarket,
        id,
        name: newMarket.name.trim(),
        flag: id,
        legalStatus: newMarket.legal ? 'user supplied' : 'missing',
      },
      newEntries = PRESETS.slice(0, 8).map(([w, h]) => newEntry(createBlueprint(id, w, h)));
    setProject((p) => ({
      ...p,
      markets: [...p.markets, m],
      campaigns: { ...p.campaigns, [id]: campaignFor(m) },
      blueprints: [...p.blueprints, ...newEntries],
      banners: {
        ...p.banners,
        ...Object.fromEntries(
          newEntries.map((e) => [
            e.id,
            { blueprintVersionId: e.activeVersionId, override: null, history: [] },
          ]),
        ),
      },
    }));
    setMarketId(id);
    setDialog(null);
    notify('Market added with eight starting layouts. Edit its banners in Studio.');
  }
  function saveEditor(entryId, bp, { stayInStudio = false } = {}) {
    if (subject.placing) return;
    setProject((p) => {
      const old = p.banners[entryId],
        revision = {
          id: uid(),
          createdAt: new Date().toISOString(),
          blueprint: structuredClone(bp),
        };
      return {
        ...p,
        banners: {
          ...p.banners,
          [entryId]: {
            ...old,
            override: revision.blueprint,
            arrangement: null,
            layoutKey: layoutKey(p.campaigns[bp.marketId]),
            history: [...(old?.history || []), revision],
          },
        },
      };
    });
    if (!stayInStudio) {
      setView('campaign', bp.marketId);
      notify('Banner saved. Blueprint reference unchanged.');
    }
  }
  function resetBanner(id) {
    if (subject.placing) return;
    setProject((p) => ({
      ...p,
      banners: {
        ...p.banners,
        [id]: {
          blueprintVersionId: p.blueprints.find((e) => e.id === id).activeVersionId,
          override: null,
          history: [],
          arrangement: null,
          layoutKey: layoutKey(p.campaigns[p.blueprints.find((e) => e.id === id).marketId]),
        },
      },
    }));
    notify('Banner regenerated from the current blueprint.');
  }
  function saveBlueprint(id, blueprint) {
    if (subject.placing) return;
    setProject(saveBlueprintStandard(project, id, blueprint));
    openBlueprint(id);
    notify('Blueprint saved. Matching Studio banner updated.');
  }
  function saveFadeStandard(id, blueprint) {
    if (subject.placing) return;
    setProject(saveBlueprintFade(project, id, blueprint));
    notify('Blueprint fade saved. Matching Studio banner updated.');
  }
  async function exportAll() {
    if (subject.placing) return;
    setDialog(null);
    await run('Preparing campaign set…', async () => {
      const blob = await exportSet(entries, project, campaign, resources, format, setBusy);
      download(blob, `${safeName(campaign.name)}-${market.id}.zip`);
      notify('Campaign ZIP exported with exact sizes and a review manifest.');
    });
  }
  const findingCount = resources
    ? entries.reduce(
        (n, e) =>
          n + qualityReport(resolveBanner(e, project.banners[e.id]), campaign, resources, e).length,
        0,
      )
    : 0;

  const backup = () =>
    run('Creating project backup…', async () => {
      download(await backupProject(project), 'bannerflow-project.zip');
      notify('Project backup includes original uploaded assets.');
    });
  const restore = (file) => {
    if (subject.placing) return;
    return run('Importing project…', async () => {
      const imported = await importProject(file);
      setProject(migrateFiReferences(migrateLineSpacing(applyBlueprintCorrections(imported))));
      setView('campaign', imported.markets[0].id);
      notify('Project imported.');
    });
  };
  const exportBanner = (bp) => {
    if (subject.placing) return;
    return run('Rendering banner…', async () => {
      const ext = bp.mode === 'animated' ? 'gif' : format;
      download(await renderOutput(bp, campaign, resources, ext), `${bp.id}-DRAFT.${ext}`);
      notify('Draft banner exported.');
    });
  };
  const analyzeSource = () =>
    run('Loading OpenCV image analysis…', async () => {
      setAnalysis(await analyzeImage(resources.hero));
      notify('Image analysis complete.');
    });
  return {
    project,
    saveStatus,
    market,
    campaign,
    entries,
    resources,
    subject,
    error,
    view,
    filter,
    setFilter,
    formatQuery,
    setFormatQuery,
    format,
    setFormat,
    dialog,
    setDialog,
    toast,
    busy: busy || (subject.placing ? 'Placing subject…' : arranging ? 'Arranging formats…' : ''),
    arranging,
    arrangeAll,
    matchBlueprints,
    size,
    setSize,
    cloneFrom,
    setCloneFrom,
    newMarket,
    setNewMarket,
    analysis,
    review,
    setReview,
    findingCount,
    setMarketId,
    setView,
    openEditor,
    openBlueprint,
    openBlueprintEditor,
    changeCampaign,
    upload,
    addSize,
    addMarket,
    saveEditor,
    resetBanner,
    saveFadeStandard,
    saveBlueprint,
    backup,
    restore,
    exportBanner,
    exportAll,
    analyzeSource,
  };
}
