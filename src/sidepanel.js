import {
  blobToDataUrl,
  bytesToHuman,
  deleteGif,
  estimateStorage,
  getGifBlob,
  listGifs,
  makeId,
  requestPersistentStorage,
  saveGif,
  touchGif,
  updateGif
} from './store.js';
import { convertVideoToGif } from './gif-encoder.js';

const ALL_GROUPS = '__all__';
const FAVORITES_GROUP = '__favorites__';
const PREVIEW_MODE = new URLSearchParams(location.search).has('preview');

const state = {
  gifs: [],
  activeGroup: ALL_GROUPS,
  search: '',
  sort: 'recent',
  previewId: null,
  objectUrls: new Map(),
  previewBlobs: new Map()
};

const el = {
  addGifButton: document.querySelector('#addGifButton'),
  addVideoButton: document.querySelector('#addVideoButton'),
  emptyState: document.querySelector('#emptyState'),
  favoriteCount: document.querySelector('#favoriteCount'),
  favoriteGrid: document.querySelector('#favoriteGrid'),
  favoritesSection: document.querySelector('#favoritesSection'),
  gifGrid: document.querySelector('#gifGrid'),
  gifInput: document.querySelector('#gifInput'),
  groupBar: document.querySelector('#groupBar'),
  groupInput: document.querySelector('#groupInput'),
  libraryCount: document.querySelector('#libraryCount'),
  libraryTitle: document.querySelector('#libraryTitle'),
  persistButton: document.querySelector('#persistButton'),
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
  videoInput: document.querySelector('#videoInput')
};

wireEvents();
if (PREVIEW_MODE) enableUiInspector();
refresh();

function wireEvents() {
  el.addGifButton.addEventListener('click', () => el.gifInput.click());
  el.addVideoButton.addEventListener('click', () => el.videoInput.click());
  el.gifInput.addEventListener('change', () => importGifFiles(el.gifInput.files));
  el.videoInput.addEventListener('change', () => importVideoFile(el.videoInput.files?.[0]));
  el.searchInput.addEventListener('input', () => {
    state.search = el.searchInput.value.trim().toLowerCase();
    render();
  });
  el.sortSelect.addEventListener('change', () => {
    state.sort = el.sortSelect.value;
    render();
  });
  el.persistButton.addEventListener('click', pinStorage);

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
    const gifs = files.filter((file) => file.type === 'image/gif');
    const videos = files.filter((file) => file.type.startsWith('video/'));
    if (gifs.length) importGifFiles(gifs);
    if (videos[0]) importVideoFile(videos[0]);
  });
}

async function refresh() {
  if (PREVIEW_MODE) {
    if (!state.gifs.length) state.gifs = createPreviewLibrary();
  } else {
    state.gifs = await listGifs();
  }

  render();
  updateStorageInfo();
}

function render() {
  renderGroupBar();

  const scoped = filteredByGroup(state.gifs);
  const searched = filterBySearch(scoped);
  const favorites = sortGifs(searched.filter((gif) => gif.favorite));
  const library = sortGifs(searched.filter((gif) => !gif.favorite));

  el.favoritesSection.hidden = favorites.length === 0 || state.activeGroup === FAVORITES_GROUP;
  el.favoriteCount.textContent = countText(favorites.length);
  el.libraryTitle.textContent = state.activeGroup === FAVORITES_GROUP ? 'Favorites' : 'Library';
  el.libraryCount.textContent = countText(library.length);
  el.emptyState.hidden = state.gifs.length !== 0 || favorites.length !== 0 || library.length !== 0;

  renderGrid(el.favoriteGrid, state.activeGroup === FAVORITES_GROUP ? [] : favorites);
  renderGrid(el.gifGrid, state.activeGroup === FAVORITES_GROUP ? favorites : library);
}

function renderGroupBar() {
  const groups = [...new Set(state.gifs.map((gif) => gif.group || 'General'))].sort((a, b) => a.localeCompare(b));
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
      if (button.id !== ALL_GROUPS && button.id !== FAVORITES_GROUP) {
        el.groupInput.value = button.id;
      }
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
    cardButton(gif.favorite ? 'Fav' : '+', () => toggleFavorite(gif), gif.favorite ? 'fav-active' : '', 'gif-card-favorite-button')
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

async function importGifFiles(files) {
  const gifFiles = [...(files || [])].filter((file) => file.type === 'image/gif');
  if (!gifFiles.length) return;

  setBusy(true);
  try {
    for (const file of gifFiles) {
      await saveImportedGif(file, file.name);
    }
    setStatus(`Added ${gifFiles.length} GIF${gifFiles.length === 1 ? '' : 's'}.`);
    await refresh();
  } finally {
    el.gifInput.value = '';
    setBusy(false);
  }
}

async function importVideoFile(file) {
  if (!file) return;
  setBusy(true);
  setProgress(0);

  try {
    const gifBlob = await convertVideoToGif(file, {}, setProgress);
    const filename = `${stripExtension(file.name)}.gif`;
    await saveImportedGif(gifBlob, filename);
    setStatus(`Converted ${file.name}.`);
    await refresh();
  } catch (error) {
    setStatus(error.message);
  } finally {
    el.videoInput.value = '';
    setProgress(null);
    setBusy(false);
  }
}

async function saveImportedGif(blob, filename) {
  const dimensions = await readImageSize(blob).catch(() => ({ width: 0, height: 0 }));
  const now = Date.now();
  const record = {
    id: makeId(),
    title: stripExtension(filename),
    filename: filename.endsWith('.gif') ? filename : `${filename}.gif`,
    group: cleanGroup(el.groupInput.value),
    favorite: false,
    createdAt: now,
    updatedAt: now,
    lastUsedAt: 0,
    useCount: 0,
    size: blob.size,
    width: dimensions.width,
    height: dimensions.height
  };

  await saveGif(record, blob.slice(0, blob.size, 'image/gif'));
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
      group: cleanGroup(el.previewGroup.value),
      favorite: el.previewFavorite.checked
    });
    setStatus('Saved GIF details.');
    el.previewDialog.close();
    return;
  }

  await updateGif(state.previewId, {
    title: el.previewTitle.value.trim() || 'Untitled GIF',
    group: cleanGroup(el.previewGroup.value),
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

async function updateStorageInfo() {
  const estimate = await estimateStorage();
  if (!estimate) return;
  el.storageInfo.textContent = `${bytesToHuman(estimate.usage)} used`;
}

async function pinStorage() {
  const persisted = await requestPersistentStorage();
  setStatus(persisted ? 'Storage pinned.' : 'Chrome kept default storage policy.');
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
  return (value || 'General').trim().slice(0, 32) || 'General';
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

function cssEscape(value) {
  return CSS.escape ? CSS.escape(value) : value.replace(/"/g, '\\"');
}




