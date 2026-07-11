import {
  blobToDataUrl,
  bytesToHuman,
  deleteGif,
  getSetting,
  getGifBlob,
  getGifThumbnail,
  getLibraryUsage,
  listGifs,
  listGroups,
  makeId,
  removeGroup,
  renameGroup,
  saveGif,
  saveGifThumbnail,
  saveGroups,
  saveSetting,
  touchGif,
  updateGif,
} from './store.js';
import { convertVideoToGif } from './gif-encoder.js';
import { pruneEmptyGroups } from './group-utils.mjs';

const ALL_GROUPS = '__all__';
const FAVORITES_GROUP = '__favorites__';
const FALLBACK_GROUP = 'General';
const RECENT_LIMIT = 15;
const ZIP_SCHEMA = 'geef.group.v1';
const DEFAULT_GRID_CELL_MIN = '110px';
const GRID_CELL_MIN_SETTING = 'gridCellMin';
const SHOW_RECENTLY_SETTING = 'showRecently';
const RESERVED_GROUP_LABELS = new Set(['all', 'favorites']);
const PREVIEW_MODE = new URLSearchParams(location.search).has('preview');

let settingsTabsDrag = null;
let suppressSettingsTabClick = false;
let groupBarDrag = null;
let suppressGroupBarClick = false;
let thumbnailObserver = null;
let libraryScrollIdleTimer = null;
let libraryIsScrolling = false;
const gridGifIndex = new Map();
let pendingImportArchive = null;

const state = {
  gifs: [],
  activeGroup: ALL_GROUPS,
  search: '',
  gridCellMin: null,
  showRecently: true,
  groups: [],
  settingsTab: 'appearance',
  previewId: null,
  objectUrls: new Map(),
  thumbnailJobs: new Map(),
  previewBlobs: new Map(),
};

const el = {
  addFileButton: document.querySelector('#addFileButton'),
  emptyState: document.querySelector('#emptyState'),
  fileInput: document.querySelector('#fileInput'),
  groupAddButton: document.querySelector('#groupAddButton'),
  groupAddInput: document.querySelector('#groupAddInput'),
  groupBar: document.querySelector('#groupBar'),
  groupBarWrap: document.querySelector('.group-bar-wrap'),
  settingsDialog: document.querySelector('#settingsDialog'),
  groupEditButton: document.querySelector('#groupEditButton'),
  groupExportList: document.querySelector('#groupExportList'),
  groupImportButton: document.querySelector('#groupImportButton'),
  groupImportInput: document.querySelector('#groupImportInput'),
  groupList: document.querySelector('#groupList'),
  exportAllButton: document.querySelector('#exportAllButton'),
  gridCellMinInput: document.querySelector('#gridCellMinInput'),
  gridCellMinApplyButton: document.querySelector('#gridCellMinApplyButton'),
  showRecentlyInput: document.querySelector('#showRecentlyInput'),
  gridCellPreviewTile: document.querySelector('#gridCellPreviewTile'),
  gridCellPreviewLabel: document.querySelector('#gridCellPreviewLabel'),
  groupPanel: document.querySelector('#groupPanel'),
  backupPanel: document.querySelector('#backupPanel'),
  dataPanel: document.querySelector('#dataPanel'),
  dataGifUsage: document.querySelector('#dataGifUsage'),
  dataThumbnailUsage: document.querySelector('#dataThumbnailUsage'),
  dataLibraryUsage: document.querySelector('#dataLibraryUsage'),
  dataGroupUsageList: document.querySelector('#dataGroupUsageList'),
  dataRemoveAllButton: document.querySelector('#dataRemoveAllButton'),
  previewDialog: document.querySelector('#previewDialog'),
  previewFavorite: document.querySelector('#previewFavorite'),
  previewGroup: document.querySelector('#previewGroup'),
  previewImage: document.querySelector('#previewImage'),
  previewPaste: document.querySelector('#previewPaste'),
  previewRemove: document.querySelector('#previewRemove'),
  previewSave: document.querySelector('#previewSave'),
  previewSend: document.querySelector('#previewSend'),
  previewTitle: document.querySelector('#previewTitle'),
  progress: document.querySelector('#progress'),
  progressBar: document.querySelector('#progress .progress-track span'),
  searchInput: document.querySelector('#searchInput'),
  libraryScroll: document.querySelector('.section-list'),
  sectionList: document.querySelector('#sectionList'),
  settingsTabList: document.querySelector('.settings-tabs'),
  settingsTabButtons: [...document.querySelectorAll('[data-settings-tab]')],
  settingsTabsWrap: document.querySelector('.settings-tabs-wrap'),
  appearancePanel: document.querySelector('#appearancePanel'),
  statusText: document.querySelector('#statusText'),
  storageInfo: document.querySelector('#storageInfo'),
  importDialog: document.querySelector('#importDialog'),
  importGroupList: document.querySelector('#importGroupList'),
  importFavoritesField: document.querySelector('#importFavoritesField'),
  importFavorites: document.querySelector('#importFavorites'),
  importConfirmButton: document.querySelector('#importConfirmButton'),
};

wireEvents();
if (PREVIEW_MODE) enableUiInspector();
refresh();

function wireEvents() {
  el.addFileButton.addEventListener('click', () => el.fileInput.click());
  el.fileInput.addEventListener('change', () =>
    importMediaFiles(el.fileInput.files),
  );
  el.groupEditButton.addEventListener('click', openSettingsDialog);
  el.groupAddButton.addEventListener('click', addGroupFromDialog);
  el.groupAddInput.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    addGroupFromDialog();
  });
  el.groupImportButton.addEventListener('click', () =>
    el.groupImportInput.click(),
  );
  el.groupImportInput.addEventListener('change', () =>
    importGroupZip(el.groupImportInput.files?.[0]),
  );
  el.importConfirmButton.addEventListener('click', confirmImportArchive);
  el.exportAllButton.addEventListener('click', exportAllGifs);
  el.dataRemoveAllButton.addEventListener('click', () => removeDataGifs());
  el.gridCellMinInput.addEventListener('change', saveGridCellMin);
  el.gridCellMinInput.addEventListener('input', updateGridCellPreview);
  el.gridCellMinApplyButton.addEventListener('click', saveGridCellMin);
  el.showRecentlyInput.addEventListener('change', saveShowRecently);
  el.settingsTabButtons.forEach((tab) =>
    tab.addEventListener('click', (event) => {
      if (suppressSettingsTabClick) {
        event.preventDefault();
        event.stopPropagation();
        suppressSettingsTabClick = false;
        return;
      }
      setSettingsTab(tab.dataset.settingsTab);
    }),
  );
  el.settingsTabList.addEventListener('scroll', syncSettingsTabsOverflow, {
    passive: true,
  });
  el.settingsTabList.addEventListener('wheel', scrollSettingsTabsWithWheel, {
    passive: false,
  });
  el.settingsTabList.addEventListener('pointerdown', startSettingsTabsDrag);
  el.settingsTabList.addEventListener('pointermove', dragSettingsTabs);
  el.settingsTabList.addEventListener('pointerup', endSettingsTabsDrag);
  el.settingsTabList.addEventListener('pointercancel', endSettingsTabsDrag);
  new ResizeObserver(syncSettingsTabsOverflow).observe(el.settingsTabList);
  requestAnimationFrame(syncSettingsTabsOverflow);
  el.groupBar.addEventListener('scroll', syncGroupBarOverflow, {
    passive: true,
  });
  el.groupBar.addEventListener('wheel', scrollGroupBarWithWheel, {
    passive: false,
  });
  el.groupBar.addEventListener('pointerdown', startGroupBarDrag);
  el.groupBar.addEventListener('pointermove', dragGroupBar);
  el.groupBar.addEventListener('pointerup', endGroupBarDrag);
  el.groupBar.addEventListener('pointercancel', endGroupBarDrag);
  new ResizeObserver(syncGroupBarOverflow).observe(el.groupBar);
  el.libraryScroll.addEventListener('wheel', beginLibraryScroll, {
    passive: true,
  });
  el.libraryScroll.addEventListener('scroll', beginLibraryScroll, {
    passive: true,
  });
  el.libraryScroll.addEventListener('touchmove', beginLibraryScroll, {
    passive: true,
  });
  el.searchInput.addEventListener('input', () => {
    state.search = el.searchInput.value.trim().toLowerCase();
    render();
  });

  el.previewPaste.addEventListener('click', () =>
    pasteGif(state.previewId, false),
  );
  el.previewSend.addEventListener('click', () =>
    pasteGif(state.previewId, true),
  );
  el.previewSave.addEventListener('click', savePreviewEdits);
  el.previewRemove.addEventListener('click', () => removeGif(state.previewId));
  el.previewDialog.addEventListener('click', closePreviewFromBackdrop);

  document.addEventListener('dragover', (event) => {
    event.preventDefault();
  });

  document.addEventListener('drop', (event) => {
    event.preventDefault();
    const files = [...(event.dataTransfer?.files || [])];
    importMediaFiles(files);
  });
}

function beginLibraryScroll() {
  libraryIsScrolling = true;
  pauseGridGifs();
  clearTimeout(libraryScrollIdleTimer);
  libraryScrollIdleTimer = setTimeout(() => {
    libraryIsScrolling = false;
  }, 140);
}

function pauseGridGifs() {
  el.sectionList
    .querySelectorAll('img[data-playing="true"]')
    .forEach(pauseGridGif);
}

async function refresh() {
  if (PREVIEW_MODE) {
    if (!state.gifs.length) state.gifs = createPreviewLibrary();
    if (!state.groups.length) state.groups = deriveGifGroups(state.gifs);
  } else {
    state.gifs = await listGifs();
    state.groups = await listGroups();
    state.gridCellMin = normalizeGridCellMin(
      await getSetting(GRID_CELL_MIN_SETTING),
    );
    state.showRecently = (await getSetting(SHOW_RECENTLY_SETTING)) !== false;
  }

  applyGridCellMin();
  ensureActiveGroupExists();
  render();
}

function render() {
  renderGroupBar();

  const sections = buildSections();
  const visibleCount = sections.reduce(
    (total, section) => total + section.gifs.length,
    0,
  );

  thumbnailObserver?.disconnect();
  gridGifIndex.clear();
  el.sectionList.replaceChildren(...sections.map(createLibrarySection));
  el.emptyState.hidden = visibleCount !== 0 || state.gifs.length !== 0;
  updateStorageInfo();
}

function buildSections() {
  if (state.activeGroup === ALL_GROUPS) return buildAllSections();

  const searched = filterBySearch(filteredByGroup(state.gifs));
  const title =
    state.activeGroup === FAVORITES_GROUP ? 'Favorites' : state.activeGroup;
  const dataUi =
    state.activeGroup === FAVORITES_GROUP
      ? 'favorites-section'
      : 'group-section';
  const group = state.activeGroup === FAVORITES_GROUP ? '' : state.activeGroup;
  return sectionList([{ title, gifs: sortGifs(searched), dataUi, group }]);
}

function buildAllSections() {
  const searched = filterBySearch(state.gifs);
  const groups = editableGroups();
  const sections = [
    {
      title: 'Favorites',
      gifs: sortGifs(searched.filter((gif) => gif.favorite)),
      dataUi: 'favorites-section',
    },
    ...(state.showRecently
      ? [
          {
            title: 'Recently',
            gifs: sortGifsByRecent(searched).slice(0, RECENT_LIMIT),
            dataUi: 'recently-section',
          },
        ]
      : []),
    ...groups.map((group) => ({
      title: group,
      gifs: sortGifs(searched.filter((gif) => gifGroup(gif) === group)),
      dataUi: 'group-section',
      group,
    })),
  ];

  return sectionList(sections);
}

function sectionList(sections) {
  return sections.filter((section) => section.gifs.length > 0);
}

function renderGroupBar() {
  const groups = editableGroups();
  const buttons = [
    { id: ALL_GROUPS, label: 'All' },
    { id: FAVORITES_GROUP, label: 'Favorites', icon: '★' },
    ...groups.map((group) => ({ id: group, label: group })),
  ];

  el.groupBar.replaceChildren(
    ...buttons.map((button) => {
      const node = document.createElement('button');
      node.type = 'button';
      node.textContent = button.icon || button.label;
      node.dataset.ui = 'group-filter';
      node.dataset.group = button.id;
      if (button.icon) {
        node.className = 'icon-filter-button favorites-filter-button';
        node.title = button.label;
        node.setAttribute('aria-label', button.label);
      }
      node.setAttribute(
        'aria-pressed',
        String(state.activeGroup === button.id),
      );
      node.addEventListener('click', () => {
        if (suppressGroupBarClick) {
          suppressGroupBarClick = false;
          return;
        }
        state.activeGroup = button.id;
        render();
      });
      return node;
    }),
  );
  el.groupBar
    .querySelector('[aria-pressed="true"]')
    ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  requestAnimationFrame(syncGroupBarOverflow);
}

function createLibrarySection(section) {
  const sectionNode = document.createElement('section');
  sectionNode.className = 'library-section';
  sectionNode.dataset.ui = section.dataUi;
  if (section.group) sectionNode.dataset.group = section.group;

  const title = document.createElement('div');
  title.className = 'section-title';
  title.dataset.ui = 'section-title';

  const heading = document.createElement('h2');
  heading.dataset.ui = 'section-heading';
  heading.textContent = section.title;

  const grid = document.createElement('div');
  grid.className = 'gif-grid';
  grid.dataset.ui = 'section-grid';

  title.append(heading);
  sectionNode.append(title, grid);
  renderGrid(grid, section.gifs);
  return sectionNode;
}

function renderGrid(container, gifs) {
  container.replaceChildren(...gifs.map(createGifCard));
  hydrateImages(container, gifs);
}

function createGifCard(gif) {
  const card = document.createElement('article');
  card.className = 'gif-card is-thumbnail-loading';
  card.dataset.ui = 'gif-card';
  card.dataset.id = gif.id;
  card.dataset.gifId = gif.id;

  const tile = document.createElement('button');
  tile.type = 'button';
  tile.className = 'gif-tile-button';
  tile.dataset.ui = 'gif-card-send-button';
  tile.setAttribute('aria-label', `Send ${gif.title}`);
  tile.addEventListener('click', () => pasteGif(gif.id, true));

  const img = document.createElement('img');
  img.dataset.ui = 'gif-card-image';
  img.alt = gif.title;
  tile.append(img);

  const actions = document.createElement('div');
  actions.className = 'gif-actions';
  actions.dataset.ui = 'gif-card-actions';
  actions.append(favoriteButton(gif), editButton(gif));

  card.addEventListener('pointerenter', () => playGridGif(gif.id, img));
  card.addEventListener('pointerleave', () => pauseGridGif(img));
  card.addEventListener('focusin', () => playGridGif(gif.id, img));
  card.addEventListener('focusout', (event) => {
    if (!card.contains(event.relatedTarget)) pauseGridGif(img);
  });

  card.append(tile, actions);
  return card;
}

async function hydrateImages(container, gifs) {
  if (!thumbnailObserver) {
    thumbnailObserver = new IntersectionObserver(handleThumbnailVisibility, {
      root: el.sectionList,
      rootMargin: '240px 0px',
    });
  }
  for (const gif of gifs) {
    const card = container.querySelector(`[data-id="${cssEscape(gif.id)}"]`);
    if (!card) continue;
    gridGifIndex.set(gif.id, gif);
    thumbnailObserver.observe(card);
  }
}

async function handleThumbnailVisibility(entries) {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    thumbnailObserver.unobserve(entry.target);
    const gif = gridGifIndex.get(entry.target.dataset.gifId);
    const image = entry.target.querySelector('img');
    if (!gif || !image) continue;
    const blob = await loadGifThumbnail(gif.id).catch(() => loadGifBlob(gif.id));
    if (!blob) continue;
    const url = objectUrlFor(gif.id, blob, 'thumbnail');
    image.src = url;
    image.dataset.staticSrc = url;
    entry.target.classList.remove('is-thumbnail-loading');
  }
}

function cardButton(label, onClick, className = '', dataUi = '') {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.title = label;
  button.setAttribute('aria-label', label);
  if (dataUi) button.dataset.ui = dataUi;
  if (className) button.className = className;
  button.addEventListener('click', onClick);
  return button;
}

function favoriteButton(gif) {
  const button = cardButton(
    gif.favorite ? '★' : '☆',
    () => toggleFavorite(gif),
    `favorite-button${gif.favorite ? ' fav-active' : ''}`,
    'gif-card-favorite-button',
  );
  const action = gif.favorite ? 'Remove from favorites' : 'Add to favorites';
  button.dataset.favorite = String(gif.favorite);
  button.setAttribute('aria-label', action);
  button.title = action;
  return button;
}

function editButton(gif) {
  const button = cardButton(
    '',
    () => openPreview(gif.id),
    'edit-button',
    'gif-card-edit-button',
  );
  button.title = 'Edit';
  button.setAttribute('aria-label', 'Edit');
  return button;
}

async function importMediaFiles(files) {
  const selectedFiles = [...(files || [])];
  const mediaFiles = selectedFiles.filter(isImportableMediaFile);
  if (!mediaFiles.length) {
    setStatus('Choose a GIF or MP4 file.');
    return;
  }

  let added = 0;
  let converted = 0;

  setBusy(true);
  try {
    for (const file of mediaFiles) {
      if (isGifFile(file)) {
        await saveImportedGif(file, file.name);
        added += 1;
        continue;
      }

      if (isVideoFile(file)) {
        setProgress(0);
        const gifBlob = await convertVideoToGif(file, {}, setProgress);
        await saveImportedGif(gifBlob, `${stripExtension(file.name)}.gif`);
        converted += 1;
        setProgress(null);
      }
    }

    const parts = [];
    if (added) parts.push(`added ${added} GIF${added === 1 ? '' : 's'}`);
    if (converted)
      parts.push(`converted ${converted} video${converted === 1 ? '' : 's'}`);
    setStatus(
      parts.length
        ? `Import complete: ${parts.join(', ')}.`
        : 'No supported files selected.',
    );
    await refresh();
  } catch (error) {
    setStatus(`Import failed: ${error.message}`);
  } finally {
    el.fileInput.value = '';
    setProgress(null);
    setBusy(false);
  }
}

function isImportableMediaFile(file) {
  return isGifFile(file) || isVideoFile(file);
}

function isGifFile(file) {
  return file.type === 'image/gif' || /\.gif$/i.test(file.name);
}

function isVideoFile(file) {
  return file.type === 'video/mp4' || /\.mp4$/i.test(file.name);
}

async function saveImportedGif(blob, filename) {
  const dimensions = await readImageSize(blob).catch(() => ({
    width: 0,
    height: 0,
  }));
  const now = Date.now();
  const record = {
    id: makeId(),
    title: stripExtension(filename),
    filename: filename.endsWith('.gif') ? filename : `${filename}.gif`,
    group: currentImportGroup(),
    favorite: false,
    createdAt: now,
    updatedAt: now,
    lastUsedAt: 0,
    useCount: 0,
    size: blob.size,
    width: dimensions.width,
    height: dimensions.height,
  };

  const gifBlob = blob.slice(0, blob.size, 'image/gif');
  if (PREVIEW_MODE) {
    state.previewBlobs.set(record.id, gifBlob);
    state.gifs = [record, ...state.gifs];
    state.groups = normalizeGroupList([...state.groups, record.group]);
    return;
  }
  const thumbnailBlob = await createStaticThumbnailBlob(gifBlob).catch(
    () => null,
  );
  await saveGif(record, gifBlob, thumbnailBlob);
}

async function openPreview(id) {
  const gif = state.gifs.find((item) => item.id === id);
  const blob = await loadGifBlob(id);
  if (!gif || !blob) return;

  state.previewId = id;
  el.previewImage.src = objectUrlFor(id, blob);
  el.previewImage.alt = gif.title;
  el.previewTitle.value = gif.title;
  el.previewGroup.value = gif.group || 'General';
  el.previewFavorite.checked = Boolean(gif.favorite);
  el.previewDialog.showModal();
}

function closePreviewFromBackdrop(event) {
  if (event.button !== 0 || event.target !== el.previewDialog) return;
  if (!isOutsideElement(event, el.previewDialog)) return;
  el.previewDialog.close();
  clearRestoredGifFocus();
}

function isOutsideElement(event, element) {
  const rect = element.getBoundingClientRect();
  return (
    event.clientX < rect.left ||
    event.clientX > rect.right ||
    event.clientY < rect.top ||
    event.clientY > rect.bottom
  );
}

function clearRestoredGifFocus() {
  requestAnimationFrame(() => {
    const active = document.activeElement;
    if (!active?.closest?.('[data-ui="gif-card"]')) return;
    active.blur?.();
  });
}

async function savePreviewEdits() {
  if (!state.previewId) return;
  if (PREVIEW_MODE) {
    const current = state.gifs.find((item) => item.id === state.previewId);
    const group = contentGroupName(el.previewGroup.value);
    mutatePreviewGif(
      state.previewId,
      {
        title: el.previewTitle.value.trim() || 'Untitled GIF',
        group,
        favorite: el.previewFavorite.checked,
      },
      {
        pruneGroups: Boolean(
          current && (current.group || FALLBACK_GROUP) !== group,
        ),
      },
    );
    setStatus('Saved GIF details.');
    el.previewDialog.close();
    return;
  }

  await updateGif(state.previewId, {
    title: el.previewTitle.value.trim() || 'Untitled GIF',
    group: contentGroupName(el.previewGroup.value),
    favorite: el.previewFavorite.checked,
  });
  setStatus('Saved GIF details.');
  await refresh();
  el.previewDialog.close();
}

async function toggleFavorite(gif) {
  if (PREVIEW_MODE) {
    mutatePreviewGif(gif.id, { favorite: !gif.favorite });
    return;
  }

  await updateGif(gif.id, { favorite: !gif.favorite });
  await refresh();
}

async function removeGif(id) {
  if (!id) return;
  const gif = state.gifs.find((item) => item.id === id);
  const ok = confirm(`Remove "${gif?.title || 'this GIF'}"?`);
  if (!ok) return;

  if (PREVIEW_MODE) {
    state.gifs = state.gifs.filter((item) => item.id !== id);
    revokeObjectUrl(id);
    state.previewBlobs.delete(id);
    prunePreviewGroups();
    el.previewDialog.close();
    setStatus('Removed GIF.');
    render();
    return;
  }

  await deleteGif(id);
  revokeObjectUrl(id);
  el.previewDialog.close();
  setStatus('Removed GIF.');
  await refresh();
}

async function pasteGif(id, submit) {
  if (!id) return;
  const gif = state.gifs.find((item) => item.id === id);
  const blob = await loadGifBlob(id);
  if (!gif || !blob) return;

  if (PREVIEW_MODE) {
    mutatePreviewGif(id, {
      useCount: (gif.useCount || 0) + 1,
      lastUsedAt: Date.now(),
    });
    setStatus(submit ? 'Preview send simulated.' : 'Preview paste simulated.');
    return;
  }

  setBusy(true);
  try {
    const dataUrl = await blobToDataUrl(blob);
    const result = await sendToActiveTab({
      type: 'GEEF_INSERT_GIF',
      filename: gif.filename || `${gif.title}.gif`,
      dataUrl,
      submit,
    });

    await touchGif(id);
    setStatus(
      result?.ok
        ? submit
          ? 'Sent GIF.'
          : 'Pasted GIF.'
        : result?.reason || 'Could not paste GIF.',
    );
    await refresh();
  } catch (error) {
    setStatus(error.message);
  } finally {
    setBusy(false);
  }
}

function enableUiInspector() {
  document.body.dataset.previewMode = 'true';

  let active = false;
  let highlighted = null;
  const toggle = document.createElement('button');
  const label = document.createElement('div');

  toggle.type = 'button';
  toggle.className = 'ui-inspect-toggle';
  toggle.dataset.ui = 'ui-inspector-toggle';
  toggle.textContent = 'Inspect UI';
  toggle.setAttribute('aria-pressed', 'false');

  label.className = 'ui-inspect-label';
  label.dataset.ui = 'ui-inspector-label';
  label.hidden = true;

  document.body.append(toggle, label);

  toggle.addEventListener('click', () => {
    active = !active;
    toggle.setAttribute('aria-pressed', String(active));
    document.body.classList.toggle('ui-inspecting', active);
    setStatus(
      active
        ? 'UI inspect on: hover, then click an element target.'
        : 'UI inspect off.',
    );
    if (!active) clearHighlight();
  });

  document.addEventListener(
    'mousemove',
    (event) => {
      if (!active) return;
      const target = closestInspectable(event.target, toggle, label);
      if (!target) {
        clearHighlight();
        return;
      }

      setHighlight(target);
    },
    true,
  );

  document.addEventListener(
    'click',
    async (event) => {
      if (!active) return;
      const target = closestInspectable(event.target, toggle, label);
      if (!target) return;

      event.preventDefault();
      event.stopPropagation();

      const text = formatInspectTarget(target);
      await navigator.clipboard?.writeText(text).catch(() => {});
      setStatus(`Target copied: ${text}`);
    },
    true,
  );

  function setHighlight(target) {
    if (highlighted !== target) {
      clearHighlight();
      highlighted = target;
      highlighted.classList.add('ui-inspect-highlight');
    }

    label.textContent = formatInspectTarget(target);
    label.hidden = false;
    positionInspectLabel(label, target);
  }

  function clearHighlight() {
    highlighted?.classList.remove('ui-inspect-highlight');
    highlighted = null;
    label.hidden = true;
  }
}

function closestInspectable(rawTarget, toggle, label) {
  if (!(rawTarget instanceof Element)) return null;
  const target = rawTarget.closest('[data-ui]');
  if (!target || target === toggle || target === label) return null;
  return target;
}

function formatInspectTarget(element) {
  const parts = [`data-ui="${element.dataset.ui}"`];
  if (element.dataset.group)
    parts.push(`data-group="${element.dataset.group}"`);
  if (element.dataset.gifId)
    parts.push(`data-gif-id="${element.dataset.gifId}"`);
  if (element.id) parts.push(`#${element.id}`);
  return parts.join(' ');
}

function positionInspectLabel(label, element) {
  const rect = element.getBoundingClientRect();
  const top = Math.max(8, Math.min(window.innerHeight - 38, rect.top - 30));
  const left = Math.max(
    8,
    Math.min(window.innerWidth - label.offsetWidth - 8, rect.left),
  );
  label.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
}

function openSettingsDialog() {
  renderSettingsEditor();
  el.groupAddInput.value = '';
  el.gridCellMinInput.value = state.gridCellMin || '';
  el.showRecentlyInput.checked = state.showRecently;
  updateGridCellPreview();
  setSettingsTab('appearance');
  el.settingsDialog.showModal();
}

function setSettingsTab(tab) {
  const nextTab = ['appearance', 'group', 'backup', 'data'].includes(tab)
    ? tab
    : 'appearance';
  state.settingsTab = nextTab;
  el.appearancePanel.hidden = nextTab !== 'appearance';
  el.groupPanel.hidden = nextTab !== 'group';
  el.backupPanel.hidden = nextTab !== 'backup';
  el.dataPanel.hidden = nextTab !== 'data';
  el.settingsTabButtons.forEach((button) => {
    const selected = button.dataset.settingsTab === nextTab;
    button.setAttribute('aria-selected', String(selected));
    button.tabIndex = selected ? 0 : -1;
    if (selected)
      button.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  });
  requestAnimationFrame(syncSettingsTabsOverflow);
  if (nextTab === 'data') renderDataPanel();
}

function syncSettingsTabsOverflow() {
  const maxScroll =
    el.settingsTabList.scrollWidth - el.settingsTabList.clientWidth;
  const fadeDistance = 28;
  const leftFade =
    maxScroll > 1
      ? Math.min(1, el.settingsTabList.scrollLeft / fadeDistance)
      : 0;
  const rightFade =
    maxScroll > 1
      ? Math.min(1, (maxScroll - el.settingsTabList.scrollLeft) / fadeDistance)
      : 0;
  el.settingsTabsWrap.style.setProperty('--left-tab-fade', String(leftFade));
  el.settingsTabsWrap.style.setProperty('--right-tab-fade', String(rightFade));
}

function scrollSettingsTabsWithWheel(event) {
  const maxScroll =
    el.settingsTabList.scrollWidth - el.settingsTabList.clientWidth;
  if (maxScroll <= 1) return;
  const delta =
    Math.abs(event.deltaX) > Math.abs(event.deltaY)
      ? event.deltaX
      : event.deltaY;
  if (!delta) return;
  event.preventDefault();
  el.settingsTabList.scrollLeft += delta;
}

function startSettingsTabsDrag(event) {
  if (event.button !== 0) return;
  settingsTabsDrag = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startScrollLeft: el.settingsTabList.scrollLeft,
    didDrag: false,
    captured: false,
  };
}

function dragSettingsTabs(event) {
  if (!settingsTabsDrag || settingsTabsDrag.pointerId !== event.pointerId)
    return;
  const distance = event.clientX - settingsTabsDrag.startX;
  if (Math.abs(distance) > 3) settingsTabsDrag.didDrag = true;
  if (!settingsTabsDrag.didDrag) return;
  if (!settingsTabsDrag.captured) {
    el.settingsTabList.setPointerCapture(event.pointerId);
    settingsTabsDrag.captured = true;
  }
  event.preventDefault();
  el.settingsTabList.classList.add('is-dragging');
  el.settingsTabList.scrollLeft = settingsTabsDrag.startScrollLeft - distance;
}

function endSettingsTabsDrag(event) {
  if (!settingsTabsDrag || settingsTabsDrag.pointerId !== event.pointerId)
    return;
  const drag = settingsTabsDrag;
  const didDrag = drag.didDrag;
  settingsTabsDrag = null;
  el.settingsTabList.classList.remove('is-dragging');
  if (drag.captured && el.settingsTabList.hasPointerCapture(event.pointerId)) {
    el.settingsTabList.releasePointerCapture(event.pointerId);
  }
  if (!didDrag) return;
  suppressSettingsTabClick = true;
  setTimeout(() => {
    suppressSettingsTabClick = false;
  }, 0);
}

function syncGroupBarOverflow() {
  const maxScroll = el.groupBar.scrollWidth - el.groupBar.clientWidth;
  const fadeDistance = 24;
  const leftFade =
    maxScroll > 1 ? Math.min(1, el.groupBar.scrollLeft / fadeDistance) : 0;
  const rightFade =
    maxScroll > 1
      ? Math.min(1, (maxScroll - el.groupBar.scrollLeft) / fadeDistance)
      : 0;
  el.groupBarWrap.style.setProperty('--left-group-fade', String(leftFade));
  el.groupBarWrap.style.setProperty('--right-group-fade', String(rightFade));
}

function scrollGroupBarWithWheel(event) {
  const maxScroll = el.groupBar.scrollWidth - el.groupBar.clientWidth;
  if (maxScroll <= 1) return;
  const delta =
    Math.abs(event.deltaX) > Math.abs(event.deltaY)
      ? event.deltaX
      : event.deltaY;
  if (!delta) return;
  event.preventDefault();
  el.groupBar.scrollLeft += delta;
}

function startGroupBarDrag(event) {
  if (event.button !== 0) return;
  groupBarDrag = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startScrollLeft: el.groupBar.scrollLeft,
    didDrag: false,
    captured: false,
  };
}

function dragGroupBar(event) {
  if (!groupBarDrag || groupBarDrag.pointerId !== event.pointerId) return;
  const distance = event.clientX - groupBarDrag.startX;
  if (Math.abs(distance) > 3) groupBarDrag.didDrag = true;
  if (!groupBarDrag.didDrag) return;
  if (!groupBarDrag.captured) {
    el.groupBar.setPointerCapture(event.pointerId);
    groupBarDrag.captured = true;
  }
  event.preventDefault();
  el.groupBar.classList.add('is-dragging');
  el.groupBar.scrollLeft = groupBarDrag.startScrollLeft - distance;
}

function endGroupBarDrag(event) {
  if (!groupBarDrag || groupBarDrag.pointerId !== event.pointerId) return;
  const drag = groupBarDrag;
  groupBarDrag = null;
  el.groupBar.classList.remove('is-dragging');
  if (drag.captured && el.groupBar.hasPointerCapture(event.pointerId)) {
    el.groupBar.releasePointerCapture(event.pointerId);
  }
  if (!drag.didDrag) return;
  suppressGroupBarClick = true;
  setTimeout(() => {
    suppressGroupBarClick = false;
  }, 0);
}

async function renderDataPanel() {
  const usage = PREVIEW_MODE ? previewLibraryUsage() : await getLibraryUsage();
  el.dataGifUsage.textContent = `${bytesToHuman(usage.gifBytes)} · ${gifCountText(usage.gifCount)}`;
  el.dataThumbnailUsage.textContent = bytesToHuman(usage.thumbnailBytes);
  el.dataLibraryUsage.textContent = bytesToHuman(usage.totalBytes);

  if (!usage.groups.length) {
    const empty = document.createElement('div');
    empty.className = 'group-editor-empty';
    empty.dataset.ui = 'data-group-empty';
    empty.textContent = 'No stored GIFs';
    el.dataGroupUsageList.replaceChildren(empty);
    return;
  }

  el.dataGroupUsageList.replaceChildren(
    ...usage.groups.map((group) => {
      const row = document.createElement('div');
      row.className = 'data-group-row';
      row.dataset.ui = 'data-group-row';
      row.dataset.group = group.group;

      const name = document.createElement('strong');
      name.textContent = group.group;
      const total = document.createElement('strong');
      total.textContent = bytesToHuman(group.totalBytes);
      const detail = document.createElement('span');
      detail.textContent = `${gifCountText(group.gifCount)} · GIFs ${bytesToHuman(group.gifBytes)} · Thumbnails ${bytesToHuman(group.thumbnailBytes)}`;
    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'danger-button';
    removeButton.dataset.ui = 'data-group-remove-button';
    removeButton.textContent = 'Remove';
    removeButton.addEventListener('click', () => removeDataGifs(group.group));
    row.append(name, total, detail, removeButton);
    return row;
    }),
  );
}

async function removeDataGifs(group = null) {
  const targets = state.gifs.filter((gif) => !group || (gif.group || FALLBACK_GROUP) === group);
  if (!targets.length) return;
  const label = group ? `group "${group}" and its ${targets.length} GIF${targets.length === 1 ? '' : 's'}` : `all ${targets.length} GIF${targets.length === 1 ? '' : 's'}`;
  if (!confirm(`Remove ${label}? This cannot be undone.`)) return;

  if (PREVIEW_MODE) {
    const targetIds = new Set(targets.map((gif) => gif.id));
    targets.forEach((gif) => state.previewBlobs.delete(gif.id));
    state.gifs = state.gifs.filter((gif) => !targetIds.has(gif.id));
    state.groups = deriveGifGroups(state.gifs);
  } else {
    for (const gif of targets) await deleteGif(gif.id);
    state.gifs = await listGifs();
    state.groups = await listGroups();
  }

  state.activeGroup = ALL_GROUPS;
  render();
  renderDataPanel();
  setStatus(`Removed ${label}.`);
}

function previewLibraryUsage() {
  const groups = new Map();
  let gifBytes = 0;

  for (const gif of state.gifs) {
    const bytes = state.previewBlobs.get(gif.id)?.size || gif.size || 0;
    const group = gif.group || FALLBACK_GROUP;
    const usage = groups.get(group) || {
      group,
      gifCount: 0,
      gifBytes: 0,
      thumbnailBytes: 0,
      totalBytes: 0,
    };
    usage.gifCount += 1;
    usage.gifBytes += bytes;
    usage.totalBytes = usage.gifBytes;
    groups.set(group, usage);
    gifBytes += bytes;
  }

  return {
    gifCount: state.gifs.length,
    gifBytes,
    thumbnailBytes: 0,
    totalBytes: gifBytes,
    groups: [...groups.values()].sort(
      (a, b) => b.totalBytes - a.totalBytes || a.group.localeCompare(b.group),
    ),
  };
}

async function saveGridCellMin() {
  const rawValue = el.gridCellMinInput.value.trim();
  const nextValue = normalizeGridCellMin(rawValue);
  if (rawValue && !nextValue) {
    el.gridCellMinInput.value = state.gridCellMin || '';
    setStatus('Use a value between 80px and 320px.');
    return;
  }

  state.gridCellMin = nextValue;
  applyGridCellMin();
  if (!PREVIEW_MODE) await saveSetting(GRID_CELL_MIN_SETTING, nextValue);
  setStatus(
    nextValue
      ? `Grid cell width set to ${nextValue}.`
      : `Grid cell width reset to ${DEFAULT_GRID_CELL_MIN}.`,
  );
}

async function saveShowRecently() {
  state.showRecently = el.showRecentlyInput.checked;
  if (!PREVIEW_MODE) await saveSetting(SHOW_RECENTLY_SETTING, state.showRecently);
  render();
  setStatus(state.showRecently ? 'Recently section shown.' : 'Recently section hidden.');
}

function normalizeGridCellMin(value) {
  const match = String(value || '')
    .trim()
    .match(/^(\d{2,3})(?:px)?$/i);
  if (!match) return null;
  const pixels = Number(match[1]);
  return pixels >= 80 && pixels <= 320 ? `${pixels}px` : null;
}

function applyGridCellMin() {
  document.documentElement.style.setProperty(
    '--gif-tile-min',
    state.gridCellMin || DEFAULT_GRID_CELL_MIN,
  );
  updateGridCellPreview();
}

function updateGridCellPreview() {
  const previewSize =
    normalizeGridCellMin(el.gridCellMinInput.value) ||
    state.gridCellMin ||
    DEFAULT_GRID_CELL_MIN;
  el.gridCellPreviewTile.style.setProperty(
    '--mock-grid-cell-size',
    previewSize,
  );
  el.gridCellPreviewLabel.textContent = previewSize;
}

function renderSettingsEditor() {
  const groups = editableGroups();
  renderGroupExportList(groups);

  if (!groups.length) {
    const empty = document.createElement('div');
    empty.className = 'group-editor-empty';
    empty.dataset.ui = 'group-editor-empty';
    empty.textContent = 'No editable groups';
    el.groupList.replaceChildren(empty);
    return;
  }

  el.groupList.replaceChildren(...groups.map(createSettingsEditorRow));
}

function createSettingsEditorRow(group) {
  const row = document.createElement('div');
  row.className = 'group-edit-row';
  row.dataset.ui = 'group-edit-row';
  row.dataset.group = group;

  const input = document.createElement('input');
  input.type = 'text';
  input.maxLength = 32;
  input.value = group;
  input.dataset.ui = 'group-rename-input';
  input.addEventListener('change', () =>
    renameEditableGroup(group, input.value),
  );
  input.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    input.blur();
  });

  const removeButton = document.createElement('button');
  removeButton.type = 'button';
  removeButton.className = 'danger-button';
  removeButton.dataset.ui = 'group-remove-button';
  removeButton.textContent = 'Remove';
  removeButton.addEventListener('click', () => removeEditableGroup(group));

  row.append(input, removeButton);
  return row;
}

function renderGroupExportList(groups = editableGroups()) {
  if (!groups.length) {
    const empty = document.createElement('div');
    empty.className = 'group-editor-empty';
    empty.dataset.ui = 'group-export-empty';
    empty.textContent = 'No groups to export';
    el.groupExportList.replaceChildren(empty);
    return;
  }

  el.groupExportList.replaceChildren(
    ...groups.map((group) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.ui = 'group-export-button';
      button.dataset.group = group;
      button.textContent = group;
      button.title = `Export ${group} as ZIP`;
      button.addEventListener('click', () => exportEditableGroup(group));
      return button;
    }),
  );
}

async function addGroupFromDialog() {
  const group = cleanGroup(el.groupAddInput.value);
  if (!validateEditableGroup(group)) return;
  if (editableGroups().includes(group)) {
    setStatus(`Group "${group}" already exists.`);
    return;
  }

  if (PREVIEW_MODE) {
    state.groups = normalizeGroupList([...state.groups, group]);
  } else {
    state.groups = await saveGroups([...editableGroups(), group]);
  }

  state.activeGroup = group;
  el.groupAddInput.value = '';
  render();
  renderSettingsEditor();
  setStatus(`Added group "${group}".`);
}

async function renameEditableGroup(oldGroup, rawNewGroup) {
  const nextGroup = cleanGroup(rawNewGroup);
  if (nextGroup === oldGroup) return;
  if (!validateEditableGroup(nextGroup)) {
    renderSettingsEditor();
    return;
  }
  if (
    editableGroups().some((group) => group !== oldGroup && group === nextGroup)
  ) {
    setStatus(`Group "${nextGroup}" already exists.`);
    renderSettingsEditor();
    return;
  }

  if (PREVIEW_MODE) {
    state.groups = normalizeGroupList(
      state.groups.map((group) => (group === oldGroup ? nextGroup : group)),
    );
    state.gifs = state.gifs.map((gif) =>
      (gif.group || FALLBACK_GROUP) === oldGroup
        ? { ...gif, group: nextGroup, updatedAt: Date.now() }
        : gif,
    );
  } else {
    await renameGroup(oldGroup, nextGroup);
    state.gifs = await listGifs();
    state.groups = await listGroups();
  }

  if (state.activeGroup === oldGroup) state.activeGroup = nextGroup;
  render();
  renderSettingsEditor();
  setStatus(`Renamed "${oldGroup}" to "${nextGroup}".`);
}

async function removeEditableGroup(group) {
  const ok = confirm(
    `Remove "${group}"? GIFs in this group will move to ${FALLBACK_GROUP}.`,
  );
  if (!ok) return;

  if (PREVIEW_MODE) {
    state.groups = normalizeGroupList(
      state.groups.filter((item) => item !== group),
    );
    state.gifs = state.gifs.map((gif) =>
      (gif.group || FALLBACK_GROUP) === group
        ? { ...gif, group: FALLBACK_GROUP, updatedAt: Date.now() }
        : gif,
    );
  } else {
    await removeGroup(group, FALLBACK_GROUP);
    state.gifs = await listGifs();
    state.groups = await listGroups();
  }

  if (state.activeGroup === group) state.activeGroup = FALLBACK_GROUP;
  render();
  renderSettingsEditor();
  setStatus(`Removed group "${group}".`);
}

async function exportEditableGroup(group) {
  const groupName = cleanGroup(group);
  if (!validateEditableGroup(groupName)) return;

  const gifs = state.gifs.filter(
    (gif) => (gif.group || FALLBACK_GROUP) === groupName,
  );
  if (!gifs.length) {
    setStatus(`Group "${groupName}" has no GIFs to export.`);
    return;
  }

  setBusy(true);
  try {
    const usedPaths = new Set();
    const gifEntries = [];
    const metadata = {
      schema: ZIP_SCHEMA,
      version: 1,
      exportedAt: new Date().toISOString(),
      groupName,
      gifs: [],
    };

    for (const gif of sortGifs(gifs)) {
      const blob = await loadGifBlob(gif.id);
      if (!blob) continue;

      const filename = ensureGifFilename(
        gif.filename || `${gif.title || gif.id}.gif`,
      );
      const path = uniqueZipPath(`gifs/${safeZipSegment(filename)}`, usedPaths);
      metadata.gifs.push({
        title: gif.title || stripExtension(filename),
        filename,
        group: groupName,
        favorite: Boolean(gif.favorite),
        createdAt: gif.createdAt || 0,
        updatedAt: gif.updatedAt || 0,
        lastUsedAt: gif.lastUsedAt || 0,
        useCount: gif.useCount || 0,
        size: blob.size,
        width: gif.width || 0,
        height: gif.height || 0,
        path,
      });
      gifEntries.push({
        name: path,
        blob: blob.slice(0, blob.size, blob.type || 'image/gif'),
      });
    }

    if (!gifEntries.length) {
      setStatus(`Could not read GIFs in "${groupName}".`);
      return;
    }

    const zipBlob = await createZipBlob([
      {
        name: 'metadata.json',
        blob: new Blob([JSON.stringify(metadata, null, 2)], {
          type: 'application/json',
        }),
      },
      ...gifEntries,
    ]);

    downloadBlob(zipBlob, `${safeZipSegment(groupName)}-geef.zip`);
    setStatus(
      `Exported "${groupName}" (${gifEntries.length} GIF${gifEntries.length === 1 ? '' : 's'}).`,
    );
  } catch (error) {
    setStatus(`Export failed: ${error.message}`);
  } finally {
    setBusy(false);
  }
}

async function exportAllGifs() {
  if (!state.gifs.length) {
    setStatus('No GIFs to export.');
    return;
  }

  setBusy(true);
  try {
    const usedPaths = new Set();
    const gifEntries = [];
    const metadata = {
      schema: ZIP_SCHEMA,
      version: 1,
      scope: 'library',
      exportedAt: new Date().toISOString(),
      gifs: [],
    };

    for (const gif of sortGifs(state.gifs)) {
      const blob = await loadGifBlob(gif.id);
      if (!blob) continue;

      const filename = ensureGifFilename(
        gif.filename || `${gif.title || gif.id}.gif`,
      );
      const path = uniqueZipPath(`gifs/${safeZipSegment(filename)}`, usedPaths);
      metadata.gifs.push({
        title: gif.title || stripExtension(filename),
        filename,
        group: cleanGroup(gif.group || FALLBACK_GROUP),
        favorite: Boolean(gif.favorite),
        createdAt: gif.createdAt || 0,
        updatedAt: gif.updatedAt || 0,
        lastUsedAt: gif.lastUsedAt || 0,
        useCount: gif.useCount || 0,
        size: blob.size,
        width: gif.width || 0,
        height: gif.height || 0,
        path,
      });
      gifEntries.push({
        name: path,
        blob: blob.slice(0, blob.size, blob.type || 'image/gif'),
      });
    }

    if (!gifEntries.length) {
      setStatus('Could not read any GIFs to export.');
      return;
    }

    const zipBlob = await createZipBlob([
      {
        name: 'metadata.json',
        blob: new Blob([JSON.stringify(metadata, null, 2)], {
          type: 'application/json',
        }),
      },
      ...gifEntries,
    ]);

    downloadBlob(zipBlob, 'geef-backup.zip');
    setStatus(
      `Exported backup (${gifEntries.length} GIF${gifEntries.length === 1 ? '' : 's'}).`,
    );
  } catch (error) {
    setStatus(`Export failed: ${error.message}`);
  } finally {
    setBusy(false);
  }
}

async function importGroupZip(file) {
  if (!file) return;
  try {
    const entries = await readZipBlob(file);
    const metadataBlob = findZipEntry(entries, 'metadata.json');
    if (!metadataBlob) throw new Error('metadata.json is missing.');
    const metadata = JSON.parse(await metadataBlob.text());
    const gifs = Array.isArray(metadata.gifs) ? metadata.gifs : [];
    if (!gifs.length) throw new Error('metadata.json has no GIF records.');
    const groups = [...new Set(gifs.map((gif) => importGroupName(gif.group || metadata.groupName || stripExtension(file.name))))];
    pendingImportArchive = { entries, metadata, gifs, file, groups };
    renderImportGroupList(groups);
    el.importFavoritesField.hidden = !gifs.some((gif) => gif.favorite);
    el.importFavorites.checked = true;
    el.importDialog.showModal();
  } catch (error) {
    setStatus(`Import failed: ${error.message}`);
  } finally {
    el.groupImportInput.value = '';
  }
}

async function confirmImportArchive() {
  if (!pendingImportArchive) return;
  const selections = [...el.importGroupList.querySelectorAll('.import-group-row')]
    .filter((row) => row.querySelector('input[type="checkbox"]').checked)
    .map((row) => ({
      sourceGroup: row.dataset.sourceGroup,
      destinationGroup: importGroupName(row.querySelector('input[type="text"]').value),
    }));
  if (!selections.length) {
    setStatus('Choose at least one group to import.');
    return;
  }
  const includeFavorites = !el.importFavoritesField.hidden && el.importFavorites.checked;
  const archive = pendingImportArchive;
  el.importDialog.close();
  pendingImportArchive = null;
  setBusy(true);
  try {
    const imported = [];
    for (const selection of selections) {
      imported.push(await importGroupArchive(archive, { ...selection, includeFavorites }));
    }
    state.activeGroup = ALL_GROUPS;
    await refresh();
    renderSettingsEditor();
    const count = imported.reduce((total, result) => total + result.count, 0);
    setStatus(`Imported ${count} GIF${count === 1 ? '' : 's'} from ${imported.length} group${imported.length === 1 ? '' : 's'}.`);
  } catch (error) {
    setStatus(`Import failed: ${error.message}`);
  } finally { setBusy(false); }
}

function renderImportGroupList(groups) {
  const rows = groups.map((group) => {
    const row = document.createElement('div');
    row.className = 'import-group-row';
    row.dataset.sourceGroup = group;

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = true;
    checkbox.setAttribute('aria-label', `Import ${group}`);

    const sourceName = document.createElement('span');
    sourceName.className = 'import-group-source';
    sourceName.textContent = group;

    const destination = document.createElement('input');
    destination.type = 'text';
    destination.maxLength = 32;
    destination.value = group;
    destination.setAttribute('aria-label', `Destination name for ${group}`);

    row.append(checkbox, sourceName, destination);
    return row;
  });
  el.importGroupList.replaceChildren(...rows);
}

async function importGroupArchive(archive, options = {}) {
  const { entries, metadata, file } = archive;
  const gifs = archive.gifs.filter((gif) => !options.sourceGroup || importGroupName(gif.group || metadata.groupName || stripExtension(file.name)) === options.sourceGroup);

  const isLibraryBackup = metadata.scope === 'library';
  const groupName = options.destinationGroup || importGroupName(metadata.groupName || stripExtension(file.name));
  const importedGroups = new Set();
  let importedCount = 0;

  for (const item of gifs) {
    const path = cleanZipLookupName(
      item.path || item.archivePath || `gifs/${item.filename || ''}`,
    );
    const entryBlob = findZipEntry(entries, path);
    if (!entryBlob) continue;

    const filename = ensureGifFilename(
      item.filename || zipBasename(path) || `${item.title || 'imported'}.gif`,
    );
    const gifBlob = entryBlob.slice(0, entryBlob.size, 'image/gif');
    const dimensions = importDimensions(item);
    const measuredDimensions =
      dimensions ||
      (await readImageSize(gifBlob).catch(() => ({ width: 0, height: 0 })));
    const now = Date.now();
    const recordGroup = options.destinationGroup || (isLibraryBackup
      ? importGroupName(item.group || FALLBACK_GROUP)
      : groupName);
    const record = {
      id: makeId(),
      title: cleanTitle(item.title || stripExtension(filename)),
      filename,
      group: recordGroup,
      favorite: options.includeFavorites === false ? false : Boolean(item.favorite),
      createdAt: validTimestamp(item.createdAt, now),
      updatedAt: now,
      lastUsedAt: validTimestamp(item.lastUsedAt, 0),
      useCount: validCount(item.useCount),
      size: gifBlob.size,
      width: measuredDimensions.width,
      height: measuredDimensions.height,
    };

    if (PREVIEW_MODE) {
      state.previewBlobs.set(record.id, gifBlob);
      state.gifs = [record, ...state.gifs];
    } else {
      const thumbnailBlob = await createStaticThumbnailBlob(gifBlob).catch(
        () => null,
      );
      await saveGif(record, gifBlob, thumbnailBlob);
    }
    importedGroups.add(recordGroup);
    importedCount += 1;
  }

  if (!importedCount)
    throw new Error('No GIF files from metadata could be found.');

  state.activeGroup = isLibraryBackup ? ALL_GROUPS : groupName;
  if (PREVIEW_MODE)
    state.groups = normalizeGroupList([...state.groups, ...importedGroups]);
  return {
    groupName: isLibraryBackup ? 'library backup' : groupName,
    count: importedCount,
  };
}

function validateEditableGroup(group) {
  if (!group) {
    setStatus('Group name is required.');
    return false;
  }
  if (isReservedGroupLabel(group)) {
    setStatus(`"${group}" is a fixed filter.`);
    return false;
  }
  return true;
}

function editableGroups() {
  return normalizeGroupList([...state.groups, ...deriveGifGroups(state.gifs)]);
}

function deriveGifGroups(gifs) {
  return normalizeGroupList(gifs.map((gif) => gif.group || FALLBACK_GROUP));
}

function normalizeGroupList(groups) {
  return [
    ...new Set(
      groups
        .map(cleanGroup)
        .filter((group) => group && !isReservedGroupLabel(group)),
    ),
  ].sort((a, b) => a.localeCompare(b));
}

function isReservedGroupLabel(group) {
  return RESERVED_GROUP_LABELS.has(cleanGroup(group).toLowerCase());
}

async function loadGifBlob(id) {
  return PREVIEW_MODE ? state.previewBlobs.get(id) || null : getGifBlob(id);
}

async function loadGifThumbnail(id) {
  if (PREVIEW_MODE) return state.previewBlobs.get(id) || null;
  if (!state.thumbnailJobs.has(id)) {
    state.thumbnailJobs.set(
      id,
      loadOrCreateGifThumbnail(id).finally(() => {
        state.thumbnailJobs.delete(id);
      }),
    );
  }
  return state.thumbnailJobs.get(id);
}

async function loadOrCreateGifThumbnail(id) {
  const cached = await getGifThumbnail(id);
  if (cached) return cached;

  const gifBlob = await getGifBlob(id);
  if (!gifBlob) return null;

  const thumbnailBlob = await createStaticThumbnailBlob(gifBlob);
  await saveGifThumbnail(id, thumbnailBlob);
  return thumbnailBlob;
}

async function playGridGif(id, image) {
  if (libraryIsScrolling) return;
  image.dataset.playing = 'true';
  const blob = await loadGifBlob(id);
  if (!blob || image.dataset.playing !== 'true') return;
  image.src = objectUrlFor(id, blob, 'gif');
}

function pauseGridGif(image) {
  image.dataset.playing = 'false';
  if (image.dataset.staticSrc) image.src = image.dataset.staticSrc;
}

async function createStaticThumbnailBlob(blob) {
  if (blob.type === 'image/svg+xml') return blob;

  const { image, cleanup } = await loadImageFromBlob(blob);
  try {
    const { width, height } = fitThumbnailSize(
      image.naturalWidth,
      image.naturalHeight,
    );
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not draw thumbnail.');
    context.drawImage(image, 0, 0, width, height);

    return (
      (await canvasToBlob(canvas, 'image/webp', 0.78)) ||
      (await canvasToBlob(canvas, 'image/png')) ||
      blob
    );
  } finally {
    cleanup();
  }
}

function loadImageFromBlob(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    const cleanup = () => URL.revokeObjectURL(url);

    image.onload = () => resolve({ image, cleanup });
    image.onerror = () => {
      cleanup();
      reject(new Error('Could not create GIF thumbnail.'));
    };
    image.src = url;
  });
}

function fitThumbnailSize(sourceWidth, sourceHeight) {
  const maxEdge = 360;
  const safeWidth = Math.max(1, sourceWidth || maxEdge);
  const safeHeight = Math.max(1, sourceHeight || Math.round(maxEdge * 0.78));
  const scale = Math.min(1, maxEdge / Math.max(safeWidth, safeHeight));
  return {
    width: Math.max(1, Math.round(safeWidth * scale)),
    height: Math.max(1, Math.round(safeHeight * scale)),
  };
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => {
    canvas.toBlob(resolve, type, quality);
  });
}

function mutatePreviewGif(id, patch, options = {}) {
  state.gifs = state.gifs.map((gif) => {
    if (gif.id !== id) return gif;
    return { ...gif, ...patch, updatedAt: Date.now() };
  });
  if (options.pruneGroups) prunePreviewGroups();
  render();
}

function prunePreviewGroups() {
  state.groups = pruneEmptyGroups(state.groups, state.gifs, {
    fallbackGroup: FALLBACK_GROUP,
    reservedLabels: RESERVED_GROUP_LABELS,
  });
  ensureActiveGroupExists();
}

function ensureActiveGroupExists() {
  if (state.activeGroup === ALL_GROUPS || state.activeGroup === FAVORITES_GROUP)
    return;
  if (!editableGroups().includes(state.activeGroup))
    state.activeGroup = ALL_GROUPS;
}

function createPreviewLibrary() {
  const now = Date.now();
  const specs = [
    ['daily-standup', 'Standup nod', 'Work', true, '#1f7a8c', '#f2b84b'],
    ['ship-it', 'Ship it', 'Work', true, '#3b6ea8', '#f07f5f'],
    ['thinking', 'Thinking', 'Reactions', true, '#6b5b95', '#88c0d0'],
    ['thanks', 'Thanks', 'Reactions', false, '#2f855a', '#f6e05e'],
    ['lunch', 'Lunch time', 'Team', false, '#a84d2f', '#ffd166'],
    ['brb', 'BRB', 'Team', false, '#5b7c99', '#ef476f'],
    ['approved', 'Approved', 'Work', false, '#247ba0', '#70c1b3'],
    ['oops', 'Oops', 'Reactions', false, '#8f3985', '#ffcad4'],
  ];

  state.previewBlobs.clear();

  return specs.map(([id, title, group, favorite, colorA, colorB], index) => {
    state.previewBlobs.set(id, makePreviewBlob(title, colorA, colorB));
    return {
      id,
      title,
      filename: `${id}.gif`,
      group,
      favorite,
      createdAt: now - index * 900000,
      updatedAt: now - index * 600000,
      lastUsedAt: index < 5 ? now - index * 180000 : 0,
      useCount: Math.max(0, 9 - index),
      size: 220000 + index * 17000,
      width: 360,
      height: 280,
    };
  });
}

function makePreviewBlob(title, colorA, colorB) {
  const safeTitle = escapeXml(title);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="360" height="280" viewBox="0 0 360 280">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${colorA}"/>
          <stop offset="100%" stop-color="${colorB}"/>
        </linearGradient>
      </defs>
      <rect width="360" height="280" rx="18" fill="url(#bg)"/>
      <circle cx="72" cy="78" r="42" fill="rgba(255,255,255,.26)"/>
      <circle cx="286" cy="205" r="58" fill="rgba(0,0,0,.16)"/>
      <rect x="34" y="188" width="292" height="52" rx="12" fill="rgba(255,255,255,.78)"/>
      <text x="180" y="221" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="25" font-weight="700" fill="#1d2530">${safeTitle}</text>
    </svg>`;
  return new Blob([svg], { type: 'image/svg+xml' });
}

function escapeXml(value) {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&apos;',
      })[char],
  );
}

async function sendToActiveTab(payload) {
  const [tab] = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true,
  });
  if (!tab?.id) throw new Error('No active tab found.');

  await chrome.scripting
    .executeScript({
      target: { tabId: tab.id },
      files: ['src/content-script.js'],
    })
    .catch(() => {});

  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tab.id, payload, (response) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(
          new Error(
            'Open a page with an editable input, focus it, then try again.',
          ),
        );
        return;
      }
      resolve(response);
    });
  });
}

function filteredByGroup(gifs) {
  if (state.activeGroup === ALL_GROUPS) return gifs;
  if (state.activeGroup === FAVORITES_GROUP)
    return gifs.filter((gif) => gif.favorite);
  return gifs.filter((gif) => (gif.group || 'General') === state.activeGroup);
}

function filterBySearch(gifs) {
  if (!state.search) return gifs;
  return gifs.filter((gif) => {
    const text = `${gif.title} ${gif.group} ${gif.filename}`.toLowerCase();
    return text.includes(state.search);
  });
}

function sortGifs(gifs) {
  return sortGifsByRecent(gifs);
}

function sortGifsByRecent(gifs) {
  return [...gifs].sort(
    (a, b) =>
      (b.lastUsedAt || b.createdAt || 0) - (a.lastUsedAt || a.createdAt || 0),
  );
}

function updateStorageInfo() {
  const usage = state.gifs.reduce(
    (total, gif) => total + Number(gif.size || 0),
    0,
  );
  el.storageInfo.textContent = `${bytesToHuman(usage)} used`;
}
function setBusy(isBusy) {
  for (const button of document.querySelectorAll('button')) {
    button.disabled = isBusy;
  }
}

function setProgress(progress) {
  el.progress.hidden = progress == null;
  if (progress == null) {
    el.progressBar.style.width = '0%';
    return;
  }
  el.progressBar.style.width = `${Math.round(progress * 100)}%`;
}

function setStatus(message) {
  el.statusText.textContent = message;
}

function cleanGroup(value) {
  return (value || FALLBACK_GROUP).trim().slice(0, 32) || FALLBACK_GROUP;
}

function contentGroupName(value) {
  const group = cleanGroup(value);
  return isReservedGroupLabel(group) ? FALLBACK_GROUP : group;
}

function gifGroup(gif) {
  return gif.group || FALLBACK_GROUP;
}

function currentImportGroup() {
  if (state.activeGroup === ALL_GROUPS || state.activeGroup === FAVORITES_GROUP)
    return FALLBACK_GROUP;
  return contentGroupName(state.activeGroup);
}

function stripExtension(filename) {
  return filename.replace(/\.[^.]+$/, '');
}

function gifCountText(count) {
  return `${count} GIF${count === 1 ? '' : 's'}`;
}

function objectUrlFor(id, blob, variant = 'gif') {
  const key = `${variant}:${id}`;
  if (state.objectUrls.has(key)) return state.objectUrls.get(key);
  const url = URL.createObjectURL(blob);
  state.objectUrls.set(key, url);
  return url;
}

function revokeObjectUrl(id) {
  for (const [key, url] of state.objectUrls) {
    if (key === id || key.endsWith(`:${id}`)) {
      URL.revokeObjectURL(url);
      state.objectUrls.delete(key);
    }
  }
}

function readImageSize(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read GIF dimensions.'));
    };
    image.src = url;
  });
}

async function createZipBlob(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encodeText(entry.name);
    const originalBytes = new Uint8Array(await entry.blob.arrayBuffer());
    const compressedBytes = await deflateRaw(originalBytes);
    const shouldCompress =
      compressedBytes && compressedBytes.length < originalBytes.length;
    const dataBytes = shouldCompress ? compressedBytes : originalBytes;
    const method = shouldCompress ? 8 : 0;
    const crc = crc32(originalBytes);
    const { dosDate, dosTime } = dateToDos(new Date());

    const localHeader = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(localHeader.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x0800, true);
    localView.setUint16(8, method, true);
    localView.setUint16(10, dosTime, true);
    localView.setUint16(12, dosDate, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, dataBytes.length, true);
    localView.setUint32(22, originalBytes.length, true);
    localView.setUint16(26, nameBytes.length, true);
    localView.setUint16(28, 0, true);
    localHeader.set(nameBytes, 30);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(centralHeader.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0x0800, true);
    centralView.setUint16(10, method, true);
    centralView.setUint16(12, dosTime, true);
    centralView.setUint16(14, dosDate, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, dataBytes.length, true);
    centralView.setUint32(24, originalBytes.length, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint16(30, 0, true);
    centralView.setUint16(32, 0, true);
    centralView.setUint16(34, 0, true);
    centralView.setUint16(36, 0, true);
    centralView.setUint32(38, 0, true);
    centralView.setUint32(42, offset, true);
    centralHeader.set(nameBytes, 46);

    localParts.push(localHeader, dataBytes);
    centralParts.push(centralHeader);
    offset += localHeader.length + dataBytes.length;
  }

  const centralOffset = offset;
  const centralSize = centralParts.reduce(
    (total, part) => total + part.length,
    0,
  );
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(4, 0, true);
  endView.setUint16(6, 0, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, centralOffset, true);
  endView.setUint16(20, 0, true);

  return new Blob([...localParts, ...centralParts, end], {
    type: 'application/zip',
  });
}

async function readZipBlob(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocdOffset = findEndOfCentralDirectory(view);
  const totalEntries = view.getUint16(eocdOffset + 10, true);
  const centralOffset = view.getUint32(eocdOffset + 16, true);
  const entries = new Map();
  let offset = centralOffset;

  for (let index = 0; index < totalEntries; index += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50)
      throw new Error('ZIP central directory is invalid.');

    const flags = view.getUint16(offset + 8, true);
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = decodeZipName(
      bytes.slice(offset + 46, offset + 46 + nameLength),
      flags,
    );

    if (!name.endsWith('/')) {
      if (view.getUint32(localOffset, true) !== 0x04034b50)
        throw new Error('ZIP local file header is invalid.');

      const localNameLength = view.getUint16(localOffset + 26, true);
      const localExtraLength = view.getUint16(localOffset + 28, true);
      const dataStart = localOffset + 30 + localNameLength + localExtraLength;
      const compressed = bytes.slice(dataStart, dataStart + compressedSize);
      let data;

      if (method === 0) {
        data = compressed;
      } else if (method === 8) {
        data = await inflateRaw(compressed);
      } else {
        throw new Error(`Unsupported ZIP compression method ${method}.`);
      }

      entries.set(
        cleanZipLookupName(name),
        new Blob([data], { type: mimeForZipName(name) }),
      );
    }

    offset += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}

async function deflateRaw(bytes) {
  if (typeof CompressionStream !== 'function') return null;
  try {
    const stream = new Blob([bytes])
      .stream()
      .pipeThrough(new CompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    return null;
  }
}

async function inflateRaw(bytes) {
  if (typeof DecompressionStream !== 'function')
    throw new Error('This browser cannot import compressed ZIP entries.');
  try {
    const stream = new Blob([bytes])
      .stream()
      .pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    throw new Error('Could not decompress ZIP entry.');
  }
}

function findEndOfCentralDirectory(view) {
  const lowerBound = Math.max(0, view.byteLength - 22 - 0xffff);
  for (let offset = view.byteLength - 22; offset >= lowerBound; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) return offset;
  }
  throw new Error('Not a ZIP file.');
}

function crc32(bytes) {
  let crc = -1;
  for (const byte of bytes) {
    crc = (crc >>> 8) ^ crc32Table()[(crc ^ byte) & 0xff];
  }
  return (crc ^ -1) >>> 0;
}

let cachedCrc32Table;
function crc32Table() {
  if (cachedCrc32Table) return cachedCrc32Table;

  cachedCrc32Table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    cachedCrc32Table[index] = value >>> 0;
  }
  return cachedCrc32Table;
}

function dateToDos(date) {
  const year = Math.max(1980, date.getFullYear());
  const dosDate =
    ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  const dosTime =
    (date.getHours() << 11) |
    (date.getMinutes() << 5) |
    Math.floor(date.getSeconds() / 2);
  return { dosDate, dosTime };
}

function encodeText(text) {
  return new TextEncoder().encode(text);
}

function decodeZipName(bytes) {
  return new TextDecoder().decode(bytes);
}

function findZipEntry(entries, name) {
  const target = cleanZipLookupName(name).toLowerCase();
  for (const [entryName, blob] of entries) {
    if (entryName.toLowerCase() === target) return blob;
  }
  return null;
}

function cleanZipLookupName(name) {
  return (name || '').replace(/\\/g, '/').replace(/^\/+/, '');
}

function zipBasename(path) {
  return cleanZipLookupName(path).split('/').filter(Boolean).pop() || '';
}

function mimeForZipName(name) {
  if (/\.json$/i.test(name)) return 'application/json';
  if (/\.gif$/i.test(name)) return 'image/gif';
  return 'application/octet-stream';
}

function importGroupName(value) {
  const group = cleanGroup((value || 'Imported').trim());
  return isReservedGroupLabel(group) ? 'Imported' : group;
}

function importDimensions(item) {
  const width = Number(item.width);
  const height = Number(item.height);
  return Number.isFinite(width) &&
    width > 0 &&
    Number.isFinite(height) &&
    height > 0
    ? { width, height }
    : null;
}

function validTimestamp(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function validCount(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function cleanTitle(value) {
  return (value || 'Untitled GIF').trim().slice(0, 80) || 'Untitled GIF';
}

function ensureGifFilename(filename) {
  const safeName = safeZipSegment(filename || 'gif.gif');
  return /\.gif$/i.test(safeName)
    ? safeName
    : `${stripExtension(safeName)}.gif`;
}

function safeZipSegment(value) {
  return (
    (value || 'group')
      .trim()
      .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-')
      .replace(/\s+/g, ' ')
      .slice(0, 80) || 'group'
  );
}

function uniqueZipPath(path, usedPaths) {
  const normalized = path.replace(/\\/g, '/');
  const slash = normalized.lastIndexOf('/');
  const prefix = slash >= 0 ? normalized.slice(0, slash + 1) : '';
  const file = slash >= 0 ? normalized.slice(slash + 1) : normalized;
  const dot = file.lastIndexOf('.');
  const stem = dot > 0 ? file.slice(0, dot) : file;
  const extension = dot > 0 ? file.slice(dot) : '';
  let candidate = `${prefix}${file}`;
  let index = 2;

  while (usedPaths.has(candidate.toLowerCase())) {
    candidate = `${prefix}${stem}-${index}${extension}`;
    index += 1;
  }

  usedPaths.add(candidate.toLowerCase());
  return candidate;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function cssEscape(value) {
  return CSS.escape ? CSS.escape(value) : value.replace(/"/g, '\\"');
}
