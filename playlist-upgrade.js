/* Musify Lite playlist upgrade v0.3.0
   Add before </body>: <script src="playlist-upgrade.js"></script>
*/
(() => {
  'use strict';

  const clean = value => String(value ?? '').trim();
  const uid = () => `playlist-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const cloneTrack = track => normalizeTrack(JSON.parse(JSON.stringify(track)));
  const safeName = name => clean(name).replace(/[\\/:*?"<>|]+/g, '-').slice(0, 80) || 'playlist';

  function downloadJSON(payload, filename) {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function normalizePlaylist(raw, forceNewId = false) {
    if (!raw || typeof raw !== 'object') throw new Error('Playlist must be an object.');
    const name = clean(raw.name);
    if (!name) throw new Error('Playlist name is missing.');
    if (!Array.isArray(raw.tracks)) throw new Error(`Playlist “${name}” has no valid track list.`);
    const tracks = [];
    const seen = new Set();
    for (const item of raw.tracks) {
      const track = safeTrack(item);
      if (track && /^[A-Za-z0-9_-]{11}$/.test(track.id) && !seen.has(track.id)) {
        seen.add(track.id);
        tracks.push(track);
      }
    }
    const now = Date.now();
    return {
      id: forceNewId ? uid() : clean(raw.id) || uid(),
      name,
      description: clean(raw.description),
      createdAt: Number(raw.createdAt) || now,
      updatedAt: Number(raw.updatedAt) || now,
      tracks
    };
  }

  function uniquePlaylistName(base, ignoreId = '') {
    const initial = clean(base) || 'Imported playlist';
    let candidate = initial;
    let number = 2;
    const exists = value => state.playlists.some(p => p.id !== ignoreId && clean(p.name).toLowerCase() === value.toLowerCase());
    while (exists(candidate)) candidate = `${initial} (${number++})`;
    return candidate;
  }

  function findPlaylist(id) {
    return state.playlists.find(item => item.id === id);
  }

  function saveAndRender(message = '') {
    persistApp();
    renderAll();
    if (message) alert(message);
  }

  function exportPlaylist(id) {
    const playlist = findPlaylist(id);
    if (!playlist) return;
    downloadJSON({
      app: 'Musify Lite',
      type: 'playlist',
      formatVersion: 1,
      exportedAt: new Date().toISOString(),
      playlist: normalizePlaylist(playlist)
    }, `musify-lite-${safeName(playlist.name)}.json`);
  }

  function exportAllPlaylists() {
    downloadJSON({
      app: 'Musify Lite',
      type: 'playlist-collection',
      formatVersion: 1,
      exportedAt: new Date().toISOString(),
      playlists: state.playlists.map(item => normalizePlaylist(item))
    }, 'musify-lite-playlists.json');
  }

  async function importPlaylistFile(file) {
    const parsed = JSON.parse(await file.text());
    let incoming;
    if (parsed?.app === 'Musify Lite' && parsed?.type === 'playlist' && parsed?.formatVersion === 1) {
      incoming = [parsed.playlist];
    } else if (parsed?.app === 'Musify Lite' && parsed?.type === 'playlist-collection' && parsed?.formatVersion === 1 && Array.isArray(parsed.playlists)) {
      incoming = parsed.playlists;
    } else if (parsed?.app === 'Musify Lite' && parsed?.formatVersion === 1 && Array.isArray(parsed.playlists)) {
      incoming = parsed.playlists;
    } else if (Array.isArray(parsed)) {
      incoming = parsed;
    } else if (parsed?.name && Array.isArray(parsed.tracks)) {
      incoming = [parsed];
    } else {
      throw new Error('This is not a supported Musify Lite playlist file.');
    }
    if (!incoming.length) throw new Error('The file contains no playlists.');
    let imported = 0;
    for (const raw of incoming) {
      const playlist = normalizePlaylist(raw, true);
      playlist.name = uniquePlaylistName(playlist.name);
      state.playlists.unshift(playlist);
      imported++;
    }
    saveAndRender(`${imported} playlist${imported === 1 ? '' : 's'} imported.`);
  }

  function editPlaylist(id) {
    const playlist = findPlaylist(id);
    if (!playlist) return;
    const name = prompt('Playlist name', playlist.name);
    if (name === null) return;
    const cleanedName = clean(name);
    if (!cleanedName) return alert('Playlist name cannot be empty.');
    if (state.playlists.some(p => p.id !== id && clean(p.name).toLowerCase() === cleanedName.toLowerCase())) {
      return alert('A playlist with that name already exists.');
    }
    const description = prompt('Playlist description', playlist.description || '');
    if (description === null) return;
    playlist.name = cleanedName;
    playlist.description = clean(description);
    playlist.updatedAt = Date.now();
    saveAndRender();
  }

  function editTrack(id, index) {
    const playlist = findPlaylist(id);
    const track = playlist?.tracks?.[index];
    if (!track) return;
    const title = prompt('Track title', track.title || track.id);
    if (title === null) return;
    const artist = prompt('Artist', track.artist || '');
    if (artist === null) return;
    track.title = clean(title) || track.id;
    track.artist = clean(artist);
    playlist.updatedAt = Date.now();
    saveAndRender();
  }

  function moveTrack(id, index, direction) {
    const playlist = findPlaylist(id);
    if (!playlist) return;
    const target = index + direction;
    if (index < 0 || target < 0 || target >= playlist.tracks.length) return;
    [playlist.tracks[index], playlist.tracks[target]] = [playlist.tracks[target], playlist.tracks[index]];
    playlist.updatedAt = Date.now();
    saveAndRender();
  }

  function duplicatePlaylist(id) {
    const source = findPlaylist(id);
    if (!source) return;
    const copy = normalizePlaylist(source, true);
    copy.name = uniquePlaylistName(`${source.name} copy`);
    copy.createdAt = copy.updatedAt = Date.now();
    copy.tracks = source.tracks.map(cloneTrack);
    state.playlists.unshift(copy);
    saveAndRender();
  }

  function addCurrentToPlaylist(id) {
    if (!state.currentTrack) return alert('Load a track first.');
    const playlist = findPlaylist(id);
    if (!playlist) return;
    if (playlist.tracks.some(track => track.id === state.currentTrack.id)) return alert('That track is already in this playlist.');
    playlist.tracks.push(cloneTrack(state.currentTrack));
    playlist.updatedAt = Date.now();
    saveAndRender();
  }

  function replaceQueue(id) {
    const playlist = findPlaylist(id);
    if (!playlist) return;
    if (!playlist.tracks.length) return alert('This playlist is empty.');
    state.queue = playlist.tracks.map(cloneTrack);
    state.queueIndex = 0;
    state.currentTrack = state.queue[0];
    recordHistory(state.currentTrack, { persist: false });
    saveAndRender();
  }

  function appendQueue(id) {
    const playlist = findPlaylist(id);
    if (!playlist) return;
    let added = 0;
    for (const track of playlist.tracks) {
      if (!state.queue.some(item => item.id === track.id)) {
        state.queue.push(cloneTrack(track));
        added++;
      }
    }
    if (state.queue.length && state.queueIndex < 0) state.queueIndex = 0;
    saveAndRender(`${added} track${added === 1 ? '' : 's'} added to the queue.`);
  }

  const originalRenderPlaylists = renderPlaylists;
  renderPlaylists = function upgradedRenderPlaylists() {
    const container = document.getElementById('playlistsList');
    if (!container) return originalRenderPlaylists();
    if (!state.playlists.length) {
      container.innerHTML = '<div class="empty-state">No playlists yet. Create one or import a playlist JSON file.</div>';
      return;
    }
    container.innerHTML = state.playlists.map(playlist => `
      <div class="playlist-card" data-playlist-card="${escapeHTML(playlist.id)}">
        <div class="section-header">
          <div><h4>${escapeHTML(playlist.name)}</h4><div class="inline-info">${escapeHTML(playlist.description || 'No description')} • ${playlist.tracks.length} tracks</div></div>
          <div class="inline-actions">
            <button class="tiny-btn" data-pl-action="replace" data-id="${escapeHTML(playlist.id)}">Play</button>
            <button class="tiny-btn" data-pl-action="append" data-id="${escapeHTML(playlist.id)}">Queue</button>
            <button class="tiny-btn" data-pl-action="add-current" data-id="${escapeHTML(playlist.id)}">Add current</button>
            <button class="tiny-btn" data-pl-action="edit-list" data-id="${escapeHTML(playlist.id)}">Edit</button>
            <button class="tiny-btn" data-pl-action="duplicate" data-id="${escapeHTML(playlist.id)}">Duplicate</button>
            <button class="tiny-btn" data-pl-action="export" data-id="${escapeHTML(playlist.id)}">Export</button>
            <button class="tiny-btn danger-btn" data-pl-action="delete" data-id="${escapeHTML(playlist.id)}">Delete</button>
          </div>
        </div>
        <div class="track-list">${playlist.tracks.length ? playlist.tracks.map((track, index) => `
          <div class="track-item">
            <div class="track-main"><strong>${escapeHTML(track.title || track.id)}</strong><span>${escapeHTML(track.artist || 'No artist')} • ${escapeHTML(track.id)}</span></div>
            <div class="track-actions">
              <button class="tiny-btn" data-pl-action="play-track" data-id="${escapeHTML(playlist.id)}" data-index="${index}">Play</button>
              <button class="tiny-btn" data-pl-action="edit-track" data-id="${escapeHTML(playlist.id)}" data-index="${index}">Edit</button>
              <button class="tiny-btn" data-pl-action="up" data-id="${escapeHTML(playlist.id)}" data-index="${index}" ${index === 0 ? 'disabled' : ''}>↑</button>
              <button class="tiny-btn" data-pl-action="down" data-id="${escapeHTML(playlist.id)}" data-index="${index}" ${index === playlist.tracks.length - 1 ? 'disabled' : ''}>↓</button>
              <button class="tiny-btn" data-pl-action="remove" data-id="${escapeHTML(playlist.id)}" data-index="${index}">Remove</button>
            </div>
          </div>`).join('') : '<div class="empty-state">This playlist is empty. Load a track and choose Add current.</div>'}</div>
      </div>`).join('');
  };

  function installToolbar() {
    const header = document.querySelector('#playlistsView .section-header');
    if (!header || document.getElementById('playlistTransferActions')) return;
    const actions = document.createElement('div');
    actions.id = 'playlistTransferActions';
    actions.className = 'inline-actions';
    actions.innerHTML = `
      <button class="ghost-btn" type="button" id="exportAllPlaylistsBtn">Export all</button>
      <button class="ghost-btn" type="button" id="importPlaylistsBtn">Import</button>
      <input id="playlistImportInput" class="sr-only" type="file" accept="application/json,.json" multiple>`;
    header.appendChild(actions);
    document.getElementById('exportAllPlaylistsBtn').addEventListener('click', exportAllPlaylists);
    document.getElementById('importPlaylistsBtn').addEventListener('click', () => document.getElementById('playlistImportInput').click());
    document.getElementById('playlistImportInput').addEventListener('change', async event => {
      try {
        for (const file of [...event.target.files]) await importPlaylistFile(file);
      } catch (error) {
        alert(error.message || 'Playlist import failed.');
      } finally {
        event.target.value = '';
      }
    });
  }

  document.addEventListener('click', event => {
    const button = event.target.closest('[data-pl-action]');
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    const action = button.dataset.plAction;
    const id = button.dataset.id;
    const index = Number(button.dataset.index);
    if (action === 'replace') replaceQueue(id);
    if (action === 'append') appendQueue(id);
    if (action === 'add-current') addCurrentToPlaylist(id);
    if (action === 'edit-list') editPlaylist(id);
    if (action === 'duplicate') duplicatePlaylist(id);
    if (action === 'export') exportPlaylist(id);
    if (action === 'delete' && confirm('Delete this playlist?')) {
      state.playlists = state.playlists.filter(item => item.id !== id);
      saveAndRender();
    }
    if (action === 'play-track') {
      const track = findPlaylist(id)?.tracks?.[index];
      if (track) playTrack(track);
    }
    if (action === 'edit-track') editTrack(id, index);
    if (action === 'up') moveTrack(id, index, -1);
    if (action === 'down') moveTrack(id, index, 1);
    if (action === 'remove') {
      const playlist = findPlaylist(id);
      if (playlist && confirm('Remove this track from the playlist?')) {
        playlist.tracks.splice(index, 1);
        playlist.updatedAt = Date.now();
        saveAndRender();
      }
    }
  }, true);

  document.addEventListener('DOMContentLoaded', () => {
    installToolbar();
    for (const playlist of state.playlists) {
      playlist.description = clean(playlist.description);
      playlist.tracks = Array.isArray(playlist.tracks) ? playlist.tracks.map(normalizeTrack).filter(track => track.id) : [];
    }
    persistApp();
    renderAll();
  });
})();
