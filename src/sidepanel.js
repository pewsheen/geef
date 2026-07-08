import {
  blobToDataUrl,
  bytesToHuman,
  deleteGif,
  getGifBlob,
  listGifs,
  listGroups,
  makeId,
  removeGroup,
  renameGroup,
  saveGif,
  saveGroups,
  touchGif,
  updateGif
} from './store.js';
import { convertVideoToGif } from './gif-encoder.js';

const ALL_GROUPS = '__all__';
const FAVORITES_GROUP = '__favorites__';
const FALLBACK_GROUP = 'General';
const ZIP_SCHEMA = 'geef.group.v1';
const RESERVED_GROUP_LABELS = new Set(['all', 'favorites']);
const PREVIEW_MODE = new URLSearchParams(location.search).has('preview');

const state = {
  gifs: [],
  activeGroup: ALL_GROUPS,
  search: '',
  sort: 'recent',
  groups: [],
  previewId: null,
  objectUrls: new Map(),
  previewBlobs: new Map()
};

const el = {
  addFileButton: document.querySelector('#addFileButton'),
  emptyState: document.querySelector('#emptyState'),
  favoriteCount: document.querySelector('#favoriteCount'),
  favoriteGrid: document.querySelector('#favoriteGrid'),
  favoritesSection: document.querySelector('#favoritesSection'),
  gifGrid: document.querySelector('#gifGrid'),
  fileInput: document.querySelector('#fileInput'),
  groupAddButton: document.querySelector('#groupAddButton'),
  groupAddInput: document.querySelector('#groupAddInput'),
  groupBar: document.querySelector('#groupBar'),
  groupDialog: document.querySelector('#groupDialog'),
  groupEditButton: document.querySelector('#groupEditButton'),
  groupImportButton: document.querySelector('#groupImportButton'),
  groupImportInput: document.querySelector('#groupImportInput'),
  groupList: document.querySelector('#groupList'),
  libraryCount: document.querySelector('#libraryCount'),
  libraryTitle: document.querySelector('#libraryTitle'),
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
  sortSelect: document.querySelector('#sortSelect'),
  statusText: document.querySelector('#statusText'),
  storageInfo: document.querySelector('#storageInfo'),

};

wireEvents();
if (PREVIEW_MODE) enableUiInspector();
refresh();

function wireEvents() {
  el.addFileButton.addEventListener('click', () => el.fileInput.click());
  el.fileInput.addEventListener('change', () => importMediaFiles(el.fileInput.files));
  el.groupEditButton.addEventListener('click', openGroupDialog);
  el.groupAddButton.addEventListener('click', addGroupFromDialog);
  el.groupAddInput.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    addGroupFromDialog();
  });
  el.groupImportButton.addEventListener('click', () => el.groupImportInput.click());
  el.groupImportInput.addEventListener('change', () => importGroupZip(el.groupImportInput.files?.[0]));
  el.searchInput.addEventListener('input', () => {
    state.search = el.searchInput.value.trim().toLowerCase();
    render();
  });
  el.sortSelect.addEventListener('change', () => {
    state.sort = el.sortSelect.value;
    render();
  });

  el.previewPaste.addEventListener('click', () => pasteGif(state.previewId, false));
  el.previewSend.addEventListener('click', () => pasteGif(state.previewId, true));
  el.previewSave.addEventListener('click', savePreviewEdits);
  el.previewRemove.addEventListener('click', () => removeGif(state.previewId));

  document.addEventListener('dragover', (event) => {
    event.preventDefault();
  });

  document.addEventListener('drop', (event) => {
    event.preventDefault();
    const files = [...(event.dataTransfer?.files || [])];
    importMediaFiles(files);
  });
}

async function refresh() {
  if (PREVIEW_MODE) {
    if (!state.gifs.length) state.gifs = createPreviewLibrary();
    if (!state.groups.length) state.groups = deriveGifGroups(state.gifs);
  } else {
    state.gifs = await listGifs();
    state.groups = await listGroups();
  }

  render();
}

function render() {
  renderGroupBar();

  const showingFavoritesGroup = state.activeGroup === FAVORITES_GROUP;
  const scoped = filteredByGroup(state.gifs);
  const searched = filterBySearch(scoped);
  const favorites = sortGifs(searched.filter((gif) => gif.favorite));
  const library = showingFavoritesGroup ? favorites : sortGifs(searched.filter((gif) => !gif.favorite));
  const showPinnedFavorites = state.activeGroup === ALL_GROUPS && favorites.length > 0;

  el.favoritesSection.hidden = !showPinnedFavorites;
  el.favoriteCount.textContent = countText(favorites.length);
  el.libraryTitle.textContent = showingFavoritesGroup ? 'Favorites' : 'Library';
  el.libraryCount.textContent = countText(library.length);
  el.emptyState.hidden = state.gifs.length !== 0 || showPinnedFavorites || library.length !== 0;

  renderGrid(el.favoriteGrid, showPinnedFavorites ? favorites : []);
  renderGrid(el.gifGrid, library);
  updateStorageInfo();
}

function renderGroupBar() {
  const groups = editableGroups();
  const buttons = [
    { id: ALL_GROUPS, label: 'All' },
    { id: FAVORITES_GROUP, label: 'Favorites' },
    ...groups.map((group) => ({ id: group, label: group }))
  ];

  el.groupBar.replaceChildren(...buttons.map((button) => {
    const node = document.createElement('button');
    node.type = 'button';
    node.textContent = button.label;
    node.dataset.ui = 'group-filter';
    node.dataset.group = button.id;
    node.setAttribute('aria-pressed', String(state.activeGroup === button.id));
    node.addEventListener('click', () => {
      state.activeGroup = button.id;
      render();
    });
    return node;
  }));
}

function renderGrid(container, gifs) {
  container.replaceChildren(...gifs.map(createGifCard));
  hydrateImages(container, gifs);
}

function createGifCard(gif) {
  const card = document.createElement('article');
  card.className = 'gif-card';
  card.dataset.ui = 'gif-card';
  card.dataset.id = gif.id;
  card.dataset.gifId = gif.id;

  const img = document.createElement('img');
  img.dataset.ui = 'gif-card-image';
  img.alt = gif.title;
  img.addEventListener('click', () => openPreview(gif.id));

  const meta = document.createElement('div');
  meta.className = 'gif-meta';
  meta.dataset.ui = 'gif-card-meta';
  meta.innerHTML = `<strong></strong><span></span>`;
  meta.querySelector('strong').textContent = gif.title;
  meta.querySelector('span').textContent = `${gif.group || 'General'} · ${bytesToHuman(gif.size)}`;

  const actions = document.createElement('div');
  actions.className = 'gif-actions';
  actions.dataset.ui = 'gif-card-actions';
  actions.append(
    cardButton('Paste', () => pasteGif(gif.id, false), '', 'gif-card-paste-button'),
    cardButton('Send', () => pasteGif(gif.id, true), '', 'gif-card-send-button'),
    favoriteButton(gif)
  );

  card.append(img, meta, actions);
  return card;
}

async function hydrateImages(container, gifs) {
  for (const gif of gifs) {
    const card = container.querySelector(`[data-id="${cssEscape(gif.id)}"]`);
    const image = card?.querySelector('img');
    if (!image) continue;

    const blob = await loadGifBlob(gif.id);
    if (!blob) continue;
    image.src = objectUrlFor(gif.id, blob);
  }
}

function cardButton(label, onClick, className = '', dataUi = '') {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
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
    'gif-card-favorite-button'
  );
  const action = gif.favorite ? 'Remove from favorites' : 'Add to favorites';
  button.dataset.favorite = String(gif.favorite);
  button.setAttribute('aria-label', action);
  button.title = action;
  return button;
}

async function importMediaFiles(files) {
  const selectedFiles = [...(files || [])];
  const archiveFiles = selectedFiles.filter(isGroupArchiveFile);
  const mediaFiles = selectedFiles.filter(isImportableMediaFile);
  if (!archiveFiles.length && !mediaFiles.length) return;

  let added = 0;
  let converted = 0;
  let archiveCount = 0;
  let archiveGifCount = 0;

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

    for (const file of archiveFiles) {
      const imported = await importGroupArchive(file);
      archiveCount += 1;
      archiveGifCount += imported.count;
    }


    const parts = [];
    if (added) parts.push(`added ${added} GIF${added === 1 ? '' : 's'}`);
    if (converted) parts.push(`converted ${converted} video${converted === 1 ? '' : 's'}`);
    if (archiveCount) {
      parts.push(`imported ${archiveGifCount} GIF${archiveGifCount === 1 ? '' : 's'} from ${archiveCount} ZIP${archiveCount === 1 ? '' : 's'}`);
    }
    setStatus(parts.length ? `Import complete: ${parts.join(', ')}.` : 'No supported files selected.');
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
  return file.type.startsWith('video/') || /\.(mp4|webm|mov)$/i.test(file.name);
}

function isGroupArchiveFile(file) {
  return ['application/zip', 'application/x-zip-compressed'].includes(file.type) || /\.zip$/i.test(file.name);
}

async function saveImportedGif(blob, filename) {
  const dimensions = await readImageSize(blob).catch(() => ({ width: 0, height: 0 }));
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
    height: dimensions.height
  };

  const gifBlob = blob.slice(0, blob.size, 'image/gif');
  if (PREVIEW_MODE) {
    state.previewBlobs.set(record.id, gifBlob);
    state.gifs = [record, ...state.gifs];
    state.groups = normalizeGroupList([...state.groups, record.group]);
    return;
  }
  await saveGif(record, gifBlob);
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

async function savePreviewEdits() {
  if (!state.previewId) return;
  if (PREVIEW_MODE) {
    mutatePreviewGif(state.previewId, {
      title: el.previewTitle.value.trim() || 'Untitled GIF',
      group: contentGroupName(el.previewGroup.value),
      favorite: el.previewFavorite.checked
    });
    setStatus('Saved GIF details.');
    el.previewDialog.close();
    return;
  }

  await updateGif(state.previewId, {
    title: el.previewTitle.value.trim() || 'Untitled GIF',
    group: contentGroupName(el.previewGroup.value),
    favorite: el.previewFavorite.checked
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
      lastUsedAt: Date.now()
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
      submit
    });

    await touchGif(id);
    setStatus(result?.ok ? (submit ? 'Sent GIF.' : 'Pasted GIF.') : result?.reason || 'Could not paste GIF.');
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
    setStatus(active ? 'UI inspect on: hover, then click an element target.' : 'UI inspect off.');
    if (!active) clearHighlight();
  });

  document.addEventListener('mousemove', (event) => {
    if (!active) return;
    const target = closestInspectable(event.target, toggle, label);
    if (!target) {
      clearHighlight();
      return;
    }

    setHighlight(target);
  }, true);

  document.addEventListener('click', async (event) => {
    if (!active) return;
    const target = closestInspectable(event.target, toggle, label);
    if (!target) return;

    event.preventDefault();
    event.stopPropagation();

    const text = formatInspectTarget(target);
    await navigator.clipboard?.writeText(text).catch(() => {});
    setStatus(`Target copied: ${text}`);
  }, true);

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
  if (element.dataset.group) parts.push(`data-group="${element.dataset.group}"`);
  if (element.dataset.gifId) parts.push(`data-gif-id="${element.dataset.gifId}"`);
  if (element.id) parts.push(`#${element.id}`);
  return parts.join(' ');
}

function positionInspectLabel(label, element) {
  const rect = element.getBoundingClientRect();
  const top = Math.max(8, Math.min(window.innerHeight - 38, rect.top - 30));
  const left = Math.max(8, Math.min(window.innerWidth - label.offsetWidth - 8, rect.left));
  label.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
}
function openGroupDialog() {
  renderGroupEditor();
  el.groupAddInput.value = '';
  el.groupDialog.showModal();
}

function renderGroupEditor() {
  const groups = editableGroups();

  if (!groups.length) {
    const empty = document.createElement('div');
    empty.className = 'group-editor-empty';
    empty.dataset.ui = 'group-editor-empty';
    empty.textContent = 'No editable groups';
    el.groupList.replaceChildren(empty);
    return;
  }

  el.groupList.replaceChildren(...groups.map(createGroupEditorRow));
}

function createGroupEditorRow(group) {
  const row = document.createElement('div');
  row.className = 'group-edit-row';
  row.dataset.ui = 'group-edit-row';
  row.dataset.group = group;

  const input = document.createElement('input');
  input.type = 'text';
  input.maxLength = 32;
  input.value = group;
  input.dataset.ui = 'group-rename-input';
  input.addEventListener('change', () => renameEditableGroup(group, input.value));
  input.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    input.blur();
  });

  const exportButton = document.createElement('button');
  exportButton.type = 'button';
  exportButton.dataset.ui = 'group-export-button';
  exportButton.textContent = 'Export';
  exportButton.title = `Export ${group} as ZIP`;
  exportButton.addEventListener('click', () => exportEditableGroup(group));

  const removeButton = document.createElement('button');
  removeButton.type = 'button';
  removeButton.className = 'danger-button';
  removeButton.dataset.ui = 'group-remove-button';
  removeButton.textContent = 'Remove';
  removeButton.addEventListener('click', () => removeEditableGroup(group));

  row.append(input, exportButton, removeButton);
  return row;
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
  renderGroupEditor();
  setStatus(`Added group "${group}".`);
}

async function renameEditableGroup(oldGroup, rawNewGroup) {
  const nextGroup = cleanGroup(rawNewGroup);
  if (nextGroup === oldGroup) return;
  if (!validateEditableGroup(nextGroup)) {
    renderGroupEditor();
    return;
  }
  if (editableGroups().some((group) => group !== oldGroup && group === nextGroup)) {
    setStatus(`Group "${nextGroup}" already exists.`);
    renderGroupEditor();
    return;
  }

  if (PREVIEW_MODE) {
    state.groups = normalizeGroupList(state.groups.map((group) => group === oldGroup ? nextGroup : group));
    state.gifs = state.gifs.map((gif) => (gif.group || FALLBACK_GROUP) === oldGroup
      ? { ...gif, group: nextGroup, updatedAt: Date.now() }
      : gif);
  } else {
    await renameGroup(oldGroup, nextGroup);
    state.gifs = await listGifs();
    state.groups = await listGroups();
  }

  if (state.activeGroup === oldGroup) state.activeGroup = nextGroup;
  render();
  renderGroupEditor();
  setStatus(`Renamed "${oldGroup}" to "${nextGroup}".`);
}

async function removeEditableGroup(group) {
  const ok = confirm(`Remove "${group}"? GIFs in this group will move to ${FALLBACK_GROUP}.`);
  if (!ok) return;

  if (PREVIEW_MODE) {
    state.groups = normalizeGroupList(state.groups.filter((item) => item !== group));
    state.gifs = state.gifs.map((gif) => (gif.group || FALLBACK_GROUP) === group
      ? { ...gif, group: FALLBACK_GROUP, updatedAt: Date.now() }
      : gif);
  } else {
    await removeGroup(group, FALLBACK_GROUP);
    state.gifs = await listGifs();
    state.groups = await listGroups();
  }

  if (state.activeGroup === group) state.activeGroup = FALLBACK_GROUP;
  render();
  renderGroupEditor();
  setStatus(`Removed group "${group}".`);
}

async function exportEditableGroup(group) {
  const groupName = cleanGroup(group);
  if (!validateEditableGroup(groupName)) return;

  const gifs = state.gifs.filter((gif) => (gif.group || FALLBACK_GROUP) === groupName);
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
      gifs: []
    };

    for (const gif of sortGifs(gifs)) {
      const blob = await loadGifBlob(gif.id);
      if (!blob) continue;

      const filename = ensureGifFilename(gif.filename || `${gif.title || gif.id}.gif`);
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
        path
      });
      gifEntries.push({ name: path, blob: blob.slice(0, blob.size, blob.type || 'image/gif') });
    }

    if (!gifEntries.length) {
      setStatus(`Could not read GIFs in "${groupName}".`);
      return;
    }

    const zipBlob = await createZipBlob([
      {
        name: 'metadata.json',
        blob: new Blob([JSON.stringify(metadata, null, 2)], { type: 'application/json' })
      },
      ...gifEntries
    ]);

    downloadBlob(zipBlob, `${safeZipSegment(groupName)}-geef.zip`);
    setStatus(`Exported "${groupName}" (${gifEntries.length} GIF${gifEntries.length === 1 ? '' : 's'}).`);
  } catch (error) {
    setStatus(`Export failed: ${error.message}`);
  } finally {
    setBusy(false);
  }
}

async function importGroupZip(file) {
  if (!file) return;

  setBusy(true);
  try {
    const imported = await importGroupArchive(file);
    await refresh();
    renderGroupEditor();
    setStatus(`Imported "${imported.groupName}" (${imported.count} GIF${imported.count === 1 ? '' : 's'}).`);
  } catch (error) {
    setStatus(`Import failed: ${error.message}`);
  } finally {
    el.groupImportInput.value = '';
    setBusy(false);
  }
}

async function importGroupArchive(file) {
  const entries = await readZipBlob(file);
  const metadataBlob = findZipEntry(entries, 'metadata.json');
  if (!metadataBlob) throw new Error('metadata.json is missing.');

  const metadata = JSON.parse(await metadataBlob.text());
  const gifs = Array.isArray(metadata.gifs) ? metadata.gifs : [];
  if (!gifs.length) throw new Error('metadata.json has no GIF records.');

  const groupName = importGroupName(metadata.groupName || stripExtension(file.name));
  let importedCount = 0;

  for (const item of gifs) {
    const path = cleanZipLookupName(item.path || item.archivePath || `gifs/${item.filename || ''}`);
    const entryBlob = findZipEntry(entries, path);
    if (!entryBlob) continue;

    const filename = ensureGifFilename(item.filename || zipBasename(path) || `${item.title || 'imported'}.gif`);
    const gifBlob = entryBlob.slice(0, entryBlob.size, 'image/gif');
    const dimensions = importDimensions(item);
    const measuredDimensions = dimensions || await readImageSize(gifBlob).catch(() => ({ width: 0, height: 0 }));
    const now = Date.now();
    const record = {
      id: makeId(),
      title: cleanTitle(item.title || stripExtension(filename)),
      filename,
      group: groupName,
      favorite: Boolean(item.favorite),
      createdAt: validTimestamp(item.createdAt, now),
      updatedAt: now,
      lastUsedAt: validTimestamp(item.lastUsedAt, 0),
      useCount: validCount(item.useCount),
      size: gifBlob.size,
      width: measuredDimensions.width,
      height: measuredDimensions.height
    };

    if (PREVIEW_MODE) {
      state.previewBlobs.set(record.id, gifBlob);
      state.gifs = [record, ...state.gifs];
    } else {
      await saveGif(record, gifBlob);
    }
    importedCount += 1;
  }

  if (!importedCount) throw new Error('No GIF files from metadata could be found.');

  state.activeGroup = groupName;
  if (PREVIEW_MODE) state.groups = normalizeGroupList([...state.groups, groupName]);
  return { groupName, count: importedCount };
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
  return [...new Set(groups.map(cleanGroup).filter((group) => group && !isReservedGroupLabel(group)))]
    .sort((a, b) => a.localeCompare(b));
}

function isReservedGroupLabel(group) {
  return RESERVED_GROUP_LABELS.has(cleanGroup(group).toLowerCase());
}
async function loadGifBlob(id) {
  return PREVIEW_MODE ? state.previewBlobs.get(id) || null : getGifBlob(id);
}

function mutatePreviewGif(id, patch) {
  state.gifs = state.gifs.map((gif) => {
    if (gif.id !== id) return gif;
    return { ...gif, ...patch, updatedAt: Date.now() };
  });
  render();
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
    ['oops', 'Oops', 'Reactions', false, '#8f3985', '#ffcad4']
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
      height: 280
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
  return value.replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&apos;'
  }[char]));
}
async function sendToActiveTab(payload) {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab?.id) throw new Error('No active tab found.');

  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ['src/content-script.js']
  }).catch(() => {});

  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tab.id, payload, (response) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error('Open a page with an editable input, focus it, then try again.'));
        return;
      }
      resolve(response);
    });
  });
}

function filteredByGroup(gifs) {
  if (state.activeGroup === ALL_GROUPS) return gifs;
  if (state.activeGroup === FAVORITES_GROUP) return gifs.filter((gif) => gif.favorite);
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
  const items = [...gifs];
  if (state.sort === 'name') {
    return items.sort((a, b) => a.title.localeCompare(b.title));
  }
  if (state.sort === 'created') {
    return items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }
  return items.sort((a, b) => (b.lastUsedAt || b.createdAt || 0) - (a.lastUsedAt || a.createdAt || 0));
}

function updateStorageInfo() {
  const usage = state.gifs.reduce((total, gif) => total + Number(gif.size || 0), 0);
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

function currentImportGroup() {
  if (state.activeGroup === ALL_GROUPS || state.activeGroup === FAVORITES_GROUP) return FALLBACK_GROUP;
  return contentGroupName(state.activeGroup);
}

function stripExtension(filename) {
  return filename.replace(/\.[^.]+$/, '');
}

function countText(count) {
  return `${count} item${count === 1 ? '' : 's'}`;
}

function objectUrlFor(id, blob) {
  if (state.objectUrls.has(id)) return state.objectUrls.get(id);
  const url = URL.createObjectURL(blob);
  state.objectUrls.set(id, url);
  return url;
}

function revokeObjectUrl(id) {
  const url = state.objectUrls.get(id);
  if (!url) return;
  URL.revokeObjectURL(url);
  state.objectUrls.delete(id);
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
    const shouldCompress = compressedBytes && compressedBytes.length < originalBytes.length;
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
  const centralSize = centralParts.reduce((total, part) => total + part.length, 0);
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

  return new Blob([...localParts, ...centralParts, end], { type: 'application/zip' });
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
    if (view.getUint32(offset, true) !== 0x02014b50) throw new Error('ZIP central directory is invalid.');

    const flags = view.getUint16(offset + 8, true);
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = decodeZipName(bytes.slice(offset + 46, offset + 46 + nameLength), flags);

    if (!name.endsWith('/')) {
      if (view.getUint32(localOffset, true) !== 0x04034b50) throw new Error('ZIP local file header is invalid.');

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

      entries.set(cleanZipLookupName(name), new Blob([data], { type: mimeForZipName(name) }));
    }

    offset += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}

async function deflateRaw(bytes) {
  if (typeof CompressionStream !== 'function') return null;
  try {
    const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    return null;
  }
}

async function inflateRaw(bytes) {
  if (typeof DecompressionStream !== 'function') throw new Error('This browser cannot import compressed ZIP entries.');
  try {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
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
  const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
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
  return Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0
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
  return /\.gif$/i.test(safeName) ? safeName : `${stripExtension(safeName)}.gif`;
}

function safeZipSegment(value) {
  return (value || 'group')
    .trim()
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-')
    .replace(/\s+/g, ' ')
    .slice(0, 80) || 'group';
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















