/* =========================================================
   STREAMVAULT — HIGH PERFORMANCE ENGINE & CONTROLLER
========================================================= */

const API_KEY = 'c5f2e226dd2ee0c8ed2c272a0ebaf049';
const BASE_URL = 'https://api.themoviedb.org/3';

// Performance CDN Image Sizing
const POSTER_URL = 'https://image.tmdb.org/t/p/w342';
const MODAL_POSTER_URL = 'https://image.tmdb.org/t/p/w500';
const BACKDROP_URL = 'https://image.tmdb.org/t/p/w1280';

const PLACEHOLDER_IMG =
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="130" height="195" fill="%23181818"><rect width="100%" height="100%"/></svg>';

// Core State
let currentItem = null;
let bannerItem = null;
let currentSeason = 1;
let currentEpisode = 1;
let currentTabCategory = 'all'; 
let currentServer = 'videasy';

let searchTimeout = null;
let lastScrollPosition = 0;
let episodeFetchToken = 0;

const showDetailsCache = {};
const episodeCache = {};

let fullDataCache = {
  movies: [],
  tv: [],
  anime: [],
  tagalog: [],
  kdrama: []
};

// See All Grid State
let gridCategory = null;
let gridPage = 1;
let gridLoading = false;
let gridHasMore = true;
let gridScrollPosition = 0;
let openedFromGrid = false;
let gridSelectedGenre = 'all';

const gridPageCache = {};
const CACHE_DURATION_MS = 2 * 60 * 60 * 1000; // 2 Hours

/* =========================================================
   API CACHING & FETCHERS
========================================================= */

function getCachedApiData(key) {
  try {
    const item = localStorage.getItem(`cache_${key}`);
    if (!item) return null;
    const { data, timestamp } = JSON.parse(item);
    if (Date.now() - timestamp < CACHE_DURATION_MS) return data;
    localStorage.removeItem(`cache_${key}`);
  } catch (e) {
    console.error('Cache read error:', e);
  }
  return null;
}

function setCachedApiData(key, data) {
  try {
    localStorage.setItem(`cache_${key}`, JSON.stringify({ data, timestamp: Date.now() }));
  } catch (e) {
    console.error('Cache write error:', e);
  }
}

async function tmdbFetch(endpoint, params = {}) {
  try {
    const url = new URL(`${BASE_URL}${endpoint}`);
    url.searchParams.set('api_key', API_KEY);
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null) url.searchParams.set(k, v);
    });

    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error('TMDB API Error:', err);
    return null;
  }
}

async function fetchTrending(type) {
  const cacheKey = `trending_${type}`;
  const cached = getCachedApiData(cacheKey);
  if (cached) return cached;

  const data = await tmdbFetch(`/trending/${type}/week`);
  const results = data?.results || [];
  if (results.length) setCachedApiData(cacheKey, results);
  return results;
}

async function fetchTrendingAnime() {
  const cacheKey = `trending_anime`;
  const cached = getCachedApiData(cacheKey);
  if (cached) return cached;

  const data = await tmdbFetch('/discover/tv', {
    with_original_language: 'ja',
    with_genres: 16,
    sort_by: 'popularity.desc',
    page: 1
  });

  const results = data?.results || [];
  results.forEach(item => { item.media_type = 'tv'; });
  if (results.length) setCachedApiData(cacheKey, results);
  return results;
}

async function fetchTagalog() {
  const cacheKey = `trending_tagalog`;
  const cached = getCachedApiData(cacheKey);
  if (cached) return cached;

  const data = await tmdbFetch('/discover/movie', {
    with_original_language: 'tl',
    sort_by: 'popularity.desc',
    page: 1
  });

  const results = data?.results || [];
  if (results.length) setCachedApiData(cacheKey, results);
  return results;
}

async function fetchKDramas() {
  const cacheKey = `trending_kdrama`;
  const cached = getCachedApiData(cacheKey);
  if (cached) return cached;

  const data = await tmdbFetch('/discover/tv', {
    with_original_language: 'ko',
    sort_by: 'popularity.desc',
    page: 1
  });

  const results = data?.results || [];
  results.forEach(item => { item.media_type = 'tv'; });
  if (results.length) setCachedApiData(cacheKey, results);
  return results;
}

/* =========================================================
   BODY SCROLL LOCK HANDLERS
========================================================= */

function lockBodyScroll() {
  lastScrollPosition = window.pageYOffset || document.documentElement.scrollTop;
  document.body.style.top = `-${lastScrollPosition}px`;
  document.body.classList.add('modal-open');
}

function unlockBodyScroll() {
  document.body.classList.remove('modal-open');
  document.body.style.top = '';
  window.scrollTo(0, lastScrollPosition);
}

/* =========================================================
   UI DISPLAY & CAROUSELS
========================================================= */

function displayBanner(item) {
  if (!item || !item.backdrop_path) return;
  bannerItem = item;

  const bannerEl = document.getElementById('banner');
  const titleEl = document.getElementById('banner-title');
  const overviewEl = document.getElementById('banner-overview');

  if (bannerEl) {
    bannerEl.style.backgroundImage = `url(${BACKDROP_URL}${item.backdrop_path})`;
  }
  if (titleEl) titleEl.textContent = item.title || item.name || '';
  if (overviewEl) overviewEl.textContent = item.overview || '';
}

function playBanner() {
  if (bannerItem) {
    openedFromGrid = false;
    showDetails(bannerItem);
  }
}

function displayList(items, containerId, mediaType) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = '';
  items.slice(0, 20).forEach(item => {
    if (!item.poster_path) return;
    if (!item.media_type) item.media_type = mediaType;

    const img = document.createElement('img');
    img.src = `${POSTER_URL}${item.poster_path}`;
    img.alt = item.title || item.name || 'Poster';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.onerror = () => { img.src = PLACEHOLDER_IMG; };
    img.onclick = () => {
      if (img.dataset.didDrag === 'true') return;
      openedFromGrid = false;
      showDetails(item);
    };
    container.appendChild(img);
  });

  setupListInteractions(container);
}

function setupListInteractions(listEl) {
  if (listEl.dataset.interactiveInitialized === 'true') return;
  listEl.dataset.interactiveInitialized = 'true';

  let isDown = false, startX, scrollLeft, hasMoved = false;

  listEl.addEventListener('mousedown', (e) => {
    isDown = true;
    hasMoved = false;
    listEl.classList.add('dragging');
    startX = e.pageX - listEl.offsetLeft;
    scrollLeft = listEl.scrollLeft;
  });

  listEl.addEventListener('mouseleave', () => { isDown = false; listEl.classList.remove('dragging'); });
  listEl.addEventListener('mouseup', () => {
    isDown = false;
    listEl.classList.remove('dragging');
    listEl.querySelectorAll('img').forEach(img => { img.dataset.didDrag = hasMoved ? 'true' : 'false'; });
  });

  listEl.addEventListener('mousemove', (e) => {
    if (!isDown) return;
    e.preventDefault();
    hasMoved = true;
    const x = e.pageX - listEl.offsetLeft;
    listEl.scrollLeft = scrollLeft - (x - startX) * 1.5;
  });
}

function scrollList(containerId, direction) {
  const container = document.getElementById(containerId);
  if (container) {
    container.scrollBy({ left: direction * (container.clientWidth * 0.75), behavior: 'smooth' });
  }
}

/* =========================================================
   DETAILS MODAL & VIDEO PLAYER
========================================================= */

async function showDetails(item) {
  currentItem = item;
  const saved = getContinueWatching().find(i => i.id === item.id);

  currentSeason = saved ? (saved.savedSeason || 1) : 1;
  currentEpisode = saved ? (saved.savedEpisode || 1) : 1;

  document.getElementById('modal-title').textContent = item.title || item.name || '';
  document.getElementById('modal-description').textContent = item.overview || 'No description available.';
  
  const image = document.getElementById('modal-image');
  image.src = item.poster_path ? `${MODAL_POSTER_URL}${item.poster_path}` : PLACEHOLDER_IMG;
  image.onerror = () => { image.src = PLACEHOLDER_IMG; };

  const rating = document.getElementById('modal-rating');
  if (rating) {
    const stars = item.vote_average ? Math.round(item.vote_average / 2) : 0;
    rating.innerHTML = '★'.repeat(stars) + '☆'.repeat(5 - stars);
  }

  updateWatchlistButton();
  saveCurrentProgress();

  const isTv = item.media_type === 'tv' || !item.title;
  document.getElementById('series-options').style.display = isTv ? 'flex' : 'none';

  const modal = document.getElementById('modal');
  modal.classList.add('active');
  modal.setAttribute('aria-hidden', 'false');
  lockBodyScroll();

  if (isTv) {
    await loadTVSeasons(item.id, currentSeason, currentEpisode);
  } else {
    loadVideo();
  }

  renderExtraDetails(item);
}

function switchServer(serverName) {
  currentServer = serverName;
  document.querySelectorAll('.server-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.server === serverName);
  });
  loadVideo();
}

function loadVideo() {
  if (!currentItem) return;
  const iframe = document.getElementById('modal-video');
  const isTv = currentItem.media_type === 'tv' || !currentItem.title;
  let embedURL = '';

  if (currentServer === 'vidsrc') {
    embedURL = isTv 
      ? `https://vidsrc.xyz/embed/tv?tmdb=${currentItem.id}&season=${currentSeason}&episode=${currentEpisode}`
      : `https://vidsrc.xyz/embed/movie?tmdb=${currentItem.id}`;
  } else if (currentServer === 'vidsrcpro') {
    embedURL = isTv 
      ? `https://vidsrc.pro/embed/tv/${currentItem.id}/${currentSeason}/${currentEpisode}`
      : `https://vidsrc.pro/embed/movie/${currentItem.id}`;
  } else {
    embedURL = isTv 
      ? `https://player.videasy.net/tv/${currentItem.id}/${currentSeason}/${currentEpisode}`
      : `https://player.videasy.net/movie/${currentItem.id}`;
  }

  if (iframe.src !== embedURL) iframe.src = embedURL;
}

/* =========================================================
   TV SHOW SEASON & EPISODE SYSTEM
========================================================= */

async function loadTVSeasons(tvId, targetSeason = 1, targetEpisode = 1) {
  const select = document.getElementById('season-select');
  select.innerHTML = '';

  let data = showDetailsCache[tvId];
  if (!data) {
    data = await tmdbFetch(`/tv/${tvId}`);
    if (data) showDetailsCache[tvId] = data;
  }

  if (data?.seasons) {
    data.seasons.forEach(season => {
      if (season.season_number <= 0) return;
      const opt = document.createElement('option');
      opt.value = season.season_number;
      opt.textContent = season.name || `Season ${season.season_number}`;
      if (season.season_number === targetSeason) opt.selected = true;
      select.appendChild(opt);
    });
  }

  currentSeason = targetSeason;
  currentEpisode = targetEpisode;
  await loadEpisodes(tvId, targetSeason);
}

async function loadEpisodes(tvId, seasonNumber) {
  const token = ++episodeFetchToken;
  const container = document.getElementById('episodes-container');
  container.innerHTML = '';

  const cacheKey = `${tvId}_${seasonNumber}`;
  let data = episodeCache[cacheKey];
  if (!data) {
    data = await tmdbFetch(`/tv/${tvId}/season/${seasonNumber}`);
    if (data) episodeCache[cacheKey] = data;
  }

  if (token !== episodeFetchToken) return;

  if (data?.episodes?.length) {
    data.episodes.forEach(ep => {
      const btn = document.createElement('button');
      btn.className = `episode-btn ${ep.episode_number === currentEpisode ? 'active' : ''}`;
      btn.textContent = `Ep ${ep.episode_number}`;
      btn.onclick = () => {
        container.querySelectorAll('.episode-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentEpisode = ep.episode_number;
        loadVideo();
        saveCurrentProgress();
      };
      container.appendChild(btn);
    });
  }
  loadVideo();
}

function onSeasonChange() {
  const select = document.getElementById('season-select');
  currentEpisode = 1;
  loadEpisodes(currentItem.id, parseInt(select.value, 10));
}

function closeModal() {
  const iframe = document.getElementById('modal-video');
  if (iframe) iframe.src = 'about:blank';

  const modal = document.getElementById('modal');
  modal.classList.remove('active');
  modal.setAttribute('aria-hidden', 'true');
  unlockBodyScroll();
}

/* =========================================================
   SEARCH MODAL
========================================================= */

function openSearchModal() {
  const modal = document.getElementById('search-modal');
  modal.classList.add('active');
  lockBodyScroll();
  setTimeout(() => document.getElementById('search-input')?.focus(), 100);
}

function closeSearchModal() {
  const modal = document.getElementById('search-modal');
  modal.classList.remove('active');
  unlockBodyScroll();
  document.getElementById('search-results').innerHTML = '';
  document.getElementById('search-input').value = '';
}

function debounceSearch() {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(searchTMDB, 300);
}

async function searchTMDB() {
  const query = document.getElementById('search-input').value.trim();
  const container = document.getElementById('search-results');
  if (!query) { container.innerHTML = ''; return; }

  const data = await tmdbFetch('/search/multi', { query });
  container.innerHTML = '';

  const results = (data?.results || []).filter(item => item.poster_path && item.media_type !== 'person');
  if (!results.length) {
    container.innerHTML = `<p style="grid-column: 1 / -1; text-align: center; color: var(--muted); padding: 40px 0;">No results found for "${query}"</p>`;
    return;
  }

  results.forEach(item => {
    const img = document.createElement('img');
    img.src = `${POSTER_URL}${item.poster_path}`;
    img.alt = item.title || item.name || '';
    img.onerror = () => { img.src = PLACEHOLDER_IMG; };
    img.onclick = () => {
      closeSearchModal();
      showDetails(item);
    };
    container.appendChild(img);
  });
}

/* =========================================================
   WATCHLIST & HISTORIES
========================================================= */

function getWatchlist() {
  try { return JSON.parse(localStorage.getItem('myList')) || []; } catch { return []; }
}

function toggleWatchlist() {
  if (!currentItem) return;
  let list = getWatchlist();
  const idx = list.findIndex(i => i.id === currentItem.id);

  if (idx > -1) list.splice(idx, 1);
  else list.push(currentItem);

  localStorage.setItem('myList', JSON.stringify(list));
  updateWatchlistButton();
  renderWatchlistRow();
}

function updateWatchlistButton() {
  const btn = document.getElementById('watchlist-btn');
  if (!btn || !currentItem) return;
  const inList = getWatchlist().some(i => i.id === currentItem.id);
  btn.textContent = inList ? 'Remove from List' : 'Add to List';
  btn.classList.toggle('remove', inList);
}

function renderWatchlistRow() {
  const list = getWatchlist();
  const row = document.getElementById('watchlist-row');
  if (row) {
    row.style.display = list.length ? 'block' : 'none';
    if (list.length) displayList(list, 'watchlist-list', 'movie');
  }
}

function getContinueWatching() {
  try { return JSON.parse(localStorage.getItem('continueWatching')) || []; } catch { return []; }
}

function saveCurrentProgress() {
  if (!currentItem) return;
  let list = getContinueWatching();
  const idx = list.findIndex(i => i.id === currentItem.id);

  const payload = {
    ...currentItem,
    savedSeason: currentSeason,
    savedEpisode: currentEpisode,
    lastWatched: Date.now()
  };

  if (idx > -1) list.splice(idx, 1);
  list.unshift(payload);
  if (list.length > 15) list.pop();

  localStorage.setItem('continueWatching', JSON.stringify(list));
  renderContinueWatchingRow();
}

function renderContinueWatchingRow() {
  const list = getContinueWatching();
  const row = document.getElementById('continue-row');
  if (row) {
    row.style.display = list.length ? 'block' : 'none';
    if (list.length) displayList(list, 'continue-list', 'movie');
  }
}

/* =========================================================
   INITIALIZATION
========================================================= */

async function init() {
  try {
    const [movies, tvShows, anime, tagalog, kdrama] = await Promise.all([
      fetchTrending('movie'),
      fetchTrending('tv'),
      fetchTrendingAnime(),
      fetchTagalog(),
      fetchKDramas()
    ]);

    fullDataCache = { movies, tv: tvShows, anime, tagalog, kdrama };

    if (movies.length) displayBanner(movies[Math.floor(Math.random() * Math.min(5, movies.length))]);

    displayList(movies, 'movies-list', 'movie');
    displayList(tvShows, 'tvshows-list', 'tv');
    displayList(anime, 'anime-list', 'tv');
    displayList(tagalog, 'tagalog-list', 'movie');
    displayList(kdrama, 'kdrama-list', 'tv');

    renderWatchlistRow();
    renderContinueWatchingRow();
  } catch (err) {
    console.error('Init Failure:', err);
  }
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeModal();
    closeSearchModal();
  }
});

init();
