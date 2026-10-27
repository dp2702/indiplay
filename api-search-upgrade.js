/* Musify Lite API-first search upgrade v0.3.0
   Place after the main application script, immediately before </body>:
   <script src="api-search-upgrade.js"></script>
*/
(() => {
  'use strict';

  const API_TIMEOUT_MS = 12000;
  let searchToken = 0;
  let lastQuery = '';
  let abortController = null;

  const byId = id => document.getElementById(id);

  function clean(value) {
    return String(value ?? '').trim();
  }

  function apiSearchUrl(query) {
    const base = sanitizeInstance(state.settings.instance);
    const params = new URLSearchParams({ q: clean(query), type: 'video' });
    return `${base}/api/v1/search?${params.toString()}`;
  }

  function nativeSearchUrl(query) {
    return buildSearchUrl(clean(query));
  }

  function durationText(seconds) {
    const total = Number(seconds);
    if (!Number.isFinite(total) || total < 0) return '';
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const secs = Math.floor(total % 60);
    return hours
      ? `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
      : `${minutes}:${String(secs).padStart(2, '0')}`;
  }

  function normalizeResult(item) {
    if (!item || item.type !== 'video') return null;
    const id = clean(item.videoId);
    if (!/^[A-Za-z0-9_-]{11}$/.test(id)) return null;
    const thumbs = Array.isArray(item.videoThumbnails) ? item.videoThumbnails : [];
    const thumbnail = thumbs.find(image => image?.quality === 'medium')?.url
      || thumbs.find(image => image?.url)?.url
      || '';
    return normalizeTrack({
      id,
      title: clean(item.title) || id,
      artist: clean(item.author),
      thumbnail,
      sourceUrl: buildWatchUrl(id),
      addedAt: Date.now(),
      lastPlayedAt: Date.now(),
      playCount: 0
    });
  }

  function rememberSearch(query) {
    state.searchHistory = [query, ...state.searchHistory.filter(item => item !== query)].slice(0, 20);
    persistApp();
    renderSearchHistory();
  }

  function setStatus(message, kind = 'info') {
    const status = byId('apiSearchStatus');
    if (!status) return;
    status.textContent = message;
    status.dataset.kind = kind;
    status.style.color = kind === 'error' ? 'var(--danger)'
      : kind === 'success' ? 'var(--success)'
      : 'var(--muted)';
  }

  function showFallback(query, reason) {
    const results = byId('apiSearchResults');
    if (!results) return;
    results.innerHTML = `
      <div class="empty-state">
        <strong>Native API search is unavailable.</strong>
        <p style="margin:8px 0 12px;">${escapeHTML(reason)}</p>
        <div class="inline-actions">
          <button class="primary-btn" type="button" data-api-action="open-native" data-query="${escapeHTML(query)}">Open search in Invidious</button>
          <button class="ghost-btn" type="button" data-api-action="retry" data-query="${escapeHTML(query)}">Retry API</button>
        </div>
        <p class="inline-info" style="margin:12px 0 0;">Open a result, copy its URL, then paste it into the field below.</p>
      </div>`;
    setStatus('API search failed. Use the Invidious tab fallback.', 'error');
  }

  function renderResults(items, query) {
    const results = byId('apiSearchResults');
    if (!results) return;
    const tracks = items.map(normalizeResult).filter(Boolean);
    if (!tracks.length) {
      results.innerHTML = `
        <div class="empty-state">
          No video results were returned for “${escapeHTML(query)}”.
          <div class="inline-actions" style="margin-top:12px;">
            <button class="ghost-btn" type="button" data-api-action="open-native" data-query="${escapeHTML(query)}">Try native Invidious search</button>
          </div>
        </div>`;
      setStatus('Search completed with no video results.');
      return;
    }

    results.innerHTML = tracks.map((track, index) => {
      const original = items.find(item => item.videoId === track.id) || {};
      const duration = durationText(original.lengthSeconds);
      const meta = [track.artist || 'Unknown channel', duration, track.id].filter(Boolean).join(' • ');
      return `
        <article class="track-item api-result" data-result-index="${index}">
          ${track.thumbnail ? `<img src="${escapeHTML(track.thumbnail)}" alt="" loading="lazy" referrerpolicy="no-referrer" style="width:112px;aspect-ratio:16/9;object-fit:cover;border-radius:10px;background:#050c18;">` : ''}
          <div class="track-main" style="flex:1;">
            <strong>${escapeHTML(track.title)}</strong>
            <span>${escapeHTML(meta)}</span>
          </div>
          <div class="track-actions">
            <button class="tiny-btn primary-btn" type="button" data-api-action="play" data-track="${encodeURIComponent(JSON.stringify(track))}">Play</button>
            <button class="tiny-btn" type="button" data-api-action="queue" data-track="${encodeURIComponent(JSON.stringify(track))}">Queue</button>
            <button class="tiny-btn" type="button" data-api-action="favorite" data-track="${encodeURIComponent(JSON.stringify(track))}">Favorite</button>
            <button class="tiny-btn" type="button" data-api-action="copy" data-url="${escapeHTML(buildWatchUrl(track.id))}">Copy URL</button>
          </div>
        </article>`;
    }).join('');
    setStatus(`${tracks.length} video result${tracks.length === 1 ? '' : 's'} loaded from the Invidious API.`, 'success');
  }

  async function apiFirstSearch(rawQuery) {
    const query = clean(rawQuery);
    if (!query) {
      setStatus('Enter a search query.', 'error');
      byId('searchInput')?.focus();
      return;
    }

    lastQuery = query;
    byId('searchInput').value = query;
    rememberSearch(query);
    const currentToken = ++searchToken;
    abortController?.abort();
    abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), API_TIMEOUT_MS);

    setStatus('Trying the Invidious JSON API…');
    byId('apiSearchResults').innerHTML = '<div class="empty-state">Searching…</div>';

    try {
      const response = await fetch(apiSearchUrl(query), {
        method: 'GET',
        headers: { Accept: 'application/json' },
        mode: 'cors',
        cache: 'no-store',
        signal: abortController.signal
      });
      if (!response.ok) throw new Error(`The API returned HTTP ${response.status}.`);
      const payload = await response.json();
      if (!Array.isArray(payload)) throw new Error('The API returned an unexpected response.');
      if (currentToken !== searchToken) return;
      renderResults(payload, query);
    } catch (error) {
      if (currentToken !== searchToken) return;
      const reason = error?.name === 'AbortError'
        ? 'The API request timed out or was cancelled.'
        : 'The configured instance blocked the API request, CORS access, or the request could not reach the instance.';
      showFallback(query, reason);
    } finally {
      clearTimeout(timeout);
    }
  }

  function decodeTrack(button) {
    try {
      return normalizeTrack(JSON.parse(decodeURIComponent(button.dataset.track || '')));
    } catch (_) {
      return null;
    }
  }

  function installSearchUI() {
    const searchView = byId('searchView');
    const oldShell = searchView?.querySelector('.player-shell');
    if (!searchView || !oldShell || byId('apiSearchResults')) return;

    const apiPanel = document.createElement('div');
    apiPanel.className = 'panel';
    apiPanel.id = 'apiSearchPanel';
    apiPanel.style.marginTop = '16px';
    apiPanel.innerHTML = `
      <div class="section-header">
        <div>
          <h4 class="section-title">Search results</h4>
          <div id="apiSearchStatus" class="inline-info" role="status" aria-live="polite">Enter a query to search through the configured Invidious API.</div>
        </div>
        <button class="ghost-btn" type="button" id="nativeSearchFallbackBtn">Open Invidious search</button>
      </div>
      <div id="apiSearchResults" class="track-list">
        <div class="empty-state">API results will appear here. If the API is blocked, Musify Lite will offer a new-tab fallback automatically.</div>
      </div>`;
    oldShell.parentNode.insertBefore(apiPanel, oldShell);

    const iframeBox = oldShell.querySelector('.player-box');
    const infoPanel = oldShell.querySelector('.panel');
    if (iframeBox) iframeBox.remove();
    if (infoPanel) {
      const paragraph = infoPanel.querySelector('p');
      if (paragraph) paragraph.textContent = 'Fallback workflow: open native Invidious search in a new tab, copy the chosen result URL, and paste it below.';
    }

    byId('reloadSearchBtn').textContent = 'Retry API';
    byId('toggleSearchFullscreenBtn').style.display = 'none';
    byId('nativeSearchFallbackBtn').addEventListener('click', () => {
      const query = clean(byId('searchInput').value) || lastQuery;
      if (!query) return setStatus('Enter a search query first.', 'error');
      window.open(nativeSearchUrl(query), '_blank', 'noopener,noreferrer');
    });
  }

  document.addEventListener('submit', event => {
    if (event.target?.id !== 'searchForm') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    apiFirstSearch(byId('searchInput').value);
  }, true);

  document.addEventListener('click', async event => {
    const chip = event.target.closest('#recentSearchChips .chip');
    if (chip) {
      event.preventDefault();
      event.stopImmediatePropagation();
      apiFirstSearch(chip.dataset.searchTerm || chip.textContent);
      return;
    }

    if (event.target?.id === 'reloadSearchBtn') {
      event.preventDefault();
      event.stopImmediatePropagation();
      apiFirstSearch(clean(byId('searchInput').value) || lastQuery);
      return;
    }

    if (event.target?.id === 'openSearchTabBtn') {
      event.preventDefault();
      event.stopImmediatePropagation();
      const query = clean(byId('searchInput').value) || lastQuery;
      if (!query) return setStatus('Enter a search query first.', 'error');
      window.open(nativeSearchUrl(query), '_blank', 'noopener,noreferrer');
      return;
    }

    const button = event.target.closest('[data-api-action]');
    if (!button) return;
    event.preventDefault();
    const action = button.dataset.apiAction;
    const query = clean(button.dataset.query) || lastQuery;
    if (action === 'open-native') window.open(nativeSearchUrl(query), '_blank', 'noopener,noreferrer');
    if (action === 'retry') apiFirstSearch(query);

    const track = decodeTrack(button);
    if (action === 'play' && track) playTrack(track);
    if (action === 'queue' && track) {
      addTrackToQueue(track, { playNow: false });
      setStatus(`Added “${track.title}” to the queue.`, 'success');
    }
    if (action === 'favorite' && track) {
      addFavorite(track);
      setStatus(`Saved “${track.title}” to favorites.`, 'success');
    }
    if (action === 'copy') {
      try {
        await navigator.clipboard.writeText(button.dataset.url || '');
        setStatus('Result URL copied.', 'success');
      } catch (_) {
        byId('resultInput').value = button.dataset.url || '';
        byId('resultInput').focus();
        setStatus('Clipboard access was blocked. The URL was placed in the paste field.', 'error');
      }
    }
  }, true);

  document.addEventListener('DOMContentLoaded', () => {
    installSearchUI();
  });
})();
