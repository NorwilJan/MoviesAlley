/* =========================================================
   STREAMVAULT — ELITE CINEMA ENGINE & API INTERFACE
========================================================= */

const API_KEY = 'c5f2e226dd2ee0c8ed2c272a0ebaf049';
const BASE_URL = 'https://api.themoviedb.org/3';

/* Performance & Quality Image Endpoints */
const POSTER_URL = 'https://image.tmdb.org/t/p/w342';
const MODAL_POSTER_URL = 'https://image.tmdb.org/t/p/w500';
const BACKDROP_URL = 'https://image.tmdb.org/t/p/original';

const PLACEHOLDER_IMG =
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="160" height="240" fill="%23161620"><rect width="100%" height="100%"/><text x="50%" y="50%" fill="%2352525c" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="12">No Poster</text></svg>';

/* State Management */
let currentItem = null;
let bannerItems = [];
let currentBannerIndex = 0;
let bannerTimer = null;

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

/* Grid State */
let gridCategory = null;
let gridPage = 1;
let gridLoading = false;
let gridHasMore = true;
let gridScrollPosition = 0;
let openedFromGrid = false;
let gridSelectedGenre = 'all';
const gridPageCache = {};

/* =========================================================
   TOAST & NOTIFICATION ENGINE
========================================================= */

function showToast(message, icon = 'fa-circle-check') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

/* =========================================================
   LOCALSTORAGE & CACHE ENGINE
========================================================= */

const CACHE_DURATION_MS = 2 * 60 * 60 * 1000; // 2 hours

function getCachedApiData(key) {
  try {
    const cachedItem = localStorage.getItem(`sv_cache_${key}`);
    if (!cachedItem) return null;
    const { data, timestamp } = JSON.parse(cachedItem);
    if (Date.now() - timestamp < CACHE_DURATION_MS) return data;
    localStorage.removeItem(`sv_cache_${key}`);
  } catch (e) {
    console.error('Error reading API cache:', e);
  }
  return null;
}

function setCachedApiData(key, data) {
  try {
    const cachePayload = { data, timestamp: Date.now() };
    localStorage.setItem(`sv_cache_${key}`, JSON.stringify(cachePayload));
  } catch (e) {
    console.error('Error setting API cache:', e);
  }
}

/* Modal Scroll Lock */
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

function getPosterUrl(path, size = 'normal') {
  if (!path) return PLACEHOLDER_IMG;
  return size === 'modal' ? `${MODAL_POSTER_URL}${path}` : `${POSTER_URL}${path}`;
}

function getBackdropUrl(path) {
  return path ? `${BACKDROP_URL}${path}` : '';
}

/* =========================================================
   TMDB API FETCHERS
========================================================= */

async function tmdbFetch(endpoint, params = {}) {
  try {
    const url = new URL(`${BASE_URL}${endpoint}`);
    url.searchParams.set('api_key', API_KEY);
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) url.searchParams.set(key, value);
    });

    const response = await fetch(url.toString());
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.error('TMDB Fetch Error:', error);
    return null;
  }
}

async function fetchTrending(type) {
  const cacheKey = `trending_${type}`;
  const cached = getCachedApiData(cacheKey);
  if (cached) return cached;

  const data = await tmdbFetch(`/trending/${type}/week`);
  const results = data && data.results ? data.results : [];
  if (results.length > 0) setCachedApiData(cacheKey, results);
  return results;
}

async function fetchTrendingAnime() {
  const cacheKey = `trending_anime`;
  const cached = getCachedApiData(cacheKey);
  if (cached) return cached;

  const data = await tmdbFetch('/discover/tv', {
    with_original_language: 'ja',
    with_genres: 16,
    sort_by: 'popularity.desc'
  });

  if (data && data.results) {
    data.results.forEach(i => i.media_type = 'tv');
    setCachedApiData(cacheKey, data.results);
    return data.results;
  }
  return [];
}

async function fetchTagalog() {
  const cacheKey = `trending_tagalog`;
  const cached = getCachedApiData(cacheKey);
  if (cached) return cached;

  const data = await tmdbFetch('/discover/movie', {
    with_original_language: 'tl',
    sort_by: 'popularity.desc'
  });
  const results = data && data.results ? data.results : [];
  if (results.length > 0) setCachedApiData(cacheKey, results);
  return results;
}

async function fetchKDramas() {
  const cacheKey = `trending_kdrama`;
  const cached = getCachedApiData(cacheKey);
  if (cached) return cached;

  const data = await tmdbFetch('/discover/tv', {
    with_original_language: 'ko',
    sort_by: 'popularity.desc'
  });

  if (data && data.results) {
    data.results.forEach(i => i.media_type = 'tv');
    setCachedApiData(cacheKey, data.results);
    return data.results;
  }
  return [];
}

/* =========================================================
   HERO BANNER ROTATION ENGINE
========================================================= */

function setupBannerCarousel(items) {
  bannerItems = items.slice(0, 5);
  if (bannerItems.length === 0) return;

  renderBannerDots();
  displayBannerItem(0);
  startBannerTimer();

  const bannerEl = document.getElementById('banner');
  if (bannerEl) {
    bannerEl.addEventListener('mouseenter', stopBannerTimer);
    bannerEl.addEventListener('mouseleave', startBannerTimer);
  }
}

function renderBannerDots() {
  const dotsContainer = document.getElementById('banner-dots');
  if (!dotsContainer) return;
  dotsContainer.innerHTML = '';

  bannerItems.forEach((_, idx) => {
    const dot = document.createElement('div');
    dot.className = `banner-dot ${idx === 0 ? 'active' : ''}`;
    dot.onclick = () => displayBannerItem(idx);
    dotsContainer.appendChild(dot);
  });
}

function displayBannerItem(index) {
  currentBannerIndex = index;
  const item = bannerItems[index];
  if (!item) return;

  const bannerEl = document.getElementById('banner');
  const titleEl = document.getElementById('banner-title');
  const overviewEl = document.getElementById('banner-overview');
  const yearEl = document.getElementById('banner-year');
  const ratingEl = document.getElementById('banner-rating');

  if (bannerEl && item.backdrop_path) {
    bannerEl.style.backgroundImage = `url(${getBackdropUrl(item.backdrop_path)})`;
  }
  if (titleEl) titleEl.textContent = item.title || item.name || '';
  if (overviewEl) overviewEl.textContent = item.overview || '';
  if (yearEl) {
    const date = item.release_date || item.first_air_date || '';
    yearEl.textContent = date ? date.split('-')[0] : 'HD';
  }
  if (ratingEl) {
    ratingEl.innerHTML = `<i class="fa-solid fa-star"></i> ${item.vote_average ? item.vote_average.toFixed(1) : 'N/A'}`;
  }

  document.querySelectorAll('.banner-dot').forEach((d, i) => {
    d.classList.toggle('active', i === index);
  });
}

function startBannerTimer() {
  stopBannerTimer();
  bannerTimer = setInterval(() => {
    const nextIdx = (currentBannerIndex + 1) % bannerItems.length;
    displayBannerItem(nextIdx);
  }, 6000);
}

function stopBannerTimer() {
  if (bannerTimer) clearInterval(bannerTimer);
}

function playBanner() {
  if (bannerItems[currentBannerIndex]) {
    openedFromGrid = false;
    showDetails(bannerItems[currentBannerIndex]);
  }
}

/* =========================================================
   SURPRISE ME RANDOMIZER
========================================================= */

function surpriseMe() {
  const allItems = [
    ...fullDataCache.movies,
    ...fullDataCache.tv,
    ...fullDataCache.anime,
    ...fullDataCache.tagalog,
    ...fullDataCache.kdrama
  ].filter(i => i && i.poster_path);

  if (allItems.length === 0) {
    showToast('Content is still loading. Try again shortly!', 'fa-triangle-exclamation');
    return;
  }

  const randomItem = allItems[Math.floor(Math.random() * allItems.length)];
  openedFromGrid = false;
  showDetails(randomItem);
  showToast(`Surprise! Showing "${randomItem.title || randomItem.name}"`, 'fa-wand-magic-sparkles');
}

/* =========================================================
   HORIZONTAL LIST RENDERER & INTERACTION ENGINE
========================================================= */

function displayList(items, containerId, mediaType) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = '';
  const limitedItems = items.slice(0, 20);

  limitedItems.forEach(item => {
    if (!item.poster_path) return;
    if (!item.media_type) item.media_type = mediaType;

    const card = document.createElement('div');
    card.className = 'movie-card';

    const year = (item.release_date || item.first_air_date || '').split('-')[0];
    const rating = item.vote_average ? item.vote_average.toFixed(1) : 'NR';

    card.innerHTML = `
      <img src="${getPosterUrl(item.poster_path)}" alt="${item.title || item.name || ''}" loading="lazy" decoding="async" />
      <div class="movie-card-info">
        <div class="movie-card-title">${item.title || item.name || ''}</div>
        <div class="movie-card-meta">
          <span>${year}</span>
          <span class="movie-card-rating"><i class="fa-solid fa-star"></i> ${rating}</span>
        </div>
      </div>
    `;

    card.onclick = () => {
      if (card.dataset.didDrag === 'true') return;
      openedFromGrid = false;
      showDetails(item);
    };

    container.appendChild(card);
  });

  setupListInteractions(container);
}

function setupListInteractions(listEl) {
  if (listEl.dataset.interactiveInitialized === 'true') return;
  listEl.dataset.interactiveInitialized = 'true';

  let isDown = false;
  let startX;
  let scrollLeft;
  let hasMoved = false;

  listEl.addEventListener('mousedown', (e) => {
    isDown = true;
    hasMoved = false;
    listEl.classList.add('dragging');
    startX = e.pageX - listEl.offsetLeft;
    scrollLeft = listEl.scrollLeft;
  });

  listEl.addEventListener('mouseleave', () => {
    isDown = false;
    listEl.classList.remove('dragging');
  });

  listEl.addEventListener('mouseup', () => {
    isDown = false;
    listEl.classList.remove('dragging');
    const cards = listEl.querySelectorAll('.movie-card');
    cards.forEach(c => c.dataset.didDrag = hasMoved ? 'true' : 'false');
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
  if (!container) return;
  const scrollAmount = container.clientWidth * 0.75;
  container.scrollBy({ left: direction * scrollAmount, behavior: 'smooth' });
}

/* =========================================================
   DETAILS MODAL & PLAYER ENGINE
========================================================= */

async function showDetails(item) {
  currentItem = item;
  const continueList = getContinueWatching();
  const savedProgress = continueList.find(i => i.id === item.id);

  currentSeason = savedProgress ? (savedProgress.savedSeason || 1) : 1;
  currentEpisode = savedProgress ? (savedProgress.savedEpisode || 1) : 1;

  const title = document.getElementById('modal-title');
  const description = document.getElementById('modal-description');
  const image = document.getElementById('modal-image');
  const rating = document.getElementById('modal-rating');

  if (title) title.textContent = item.title || item.name || '';
  if (description) description.textContent = item.overview || 'No overview available.';
  if (image) image.src = getPosterUrl(item.poster_path, 'modal');

  if (rating) {
    const stars = item.vote_average ? Math.round(item.vote_average / 2) : 0;
    rating.innerHTML = '★'.repeat(stars) + '☆'.repeat(5 - stars);
  }

  updateWatchlistButton();
  saveCurrentProgress();

  const isTv = item.media_type === 'tv' || !item.title;
  const seriesOptions = document.getElementById('series-options');
  if (seriesOptions) seriesOptions.style.display = isTv ? 'flex' : 'none';

  const modal = document.getElementById('modal');
  if (modal) {
    modal.classList.add('active');
    lockBodyScroll();
  }

  if (isTv) {
    await loadTVSeasons(item.id, currentSeason, currentEpisode);
  } else {
    requestAnimationFrame(() => loadVideo());
  }

  renderExtraDetails(item);
}

function switchServer(serverName) {
  currentServer = serverName;
  document.querySelectorAll('.server-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.server === serverName);
  });
  loadVideo();
  showToast(`Switched to Server ${serverName.toUpperCase()}`, 'fa-server');
}

function loadVideo() {
  if (!currentItem) return;
  const iframe = document.getElementById('modal-video');
  if (!iframe) return;

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

async function renderExtraDetails(item) {
  const trailerContainer = document.getElementById('modal-trailer-container');
  const castContainer = document.getElementById('modal-cast-container');
  if (trailerContainer) trailerContainer.innerHTML = '';
  if (castContainer) castContainer.innerHTML = '';

  const isTv = item.media_type === 'tv' || !item.title;
  const data = await tmdbFetch(isTv ? `/tv/${item.id}` : `/movie/${item.id}`, { append_to_response: 'credits,videos' });
  if (!data) return;

  if (data.videos && data.videos.results && trailerContainer) {
    const trailer = data.videos.results.find(v => v.type === 'Trailer' && v.site === 'YouTube') || data.videos.results[0];
    if (trailer) {
      trailerContainer.innerHTML = `
        <h3>Official Trailer</h3>
        <div class="trailer-box">
          <iframe src="https://www.youtube-nocookie.com/embed/${trailer.key}" allowfullscreen></iframe>
        </div>
      `;
    }
  }

  if (data.credits && data.credits.cast && castContainer) {
    const topCast = data.credits.cast.slice(0, 10);
    if (topCast.length > 0) {
      const castHtml = topCast.map(actor => `
        <div class="cast-item">
          <img src="${actor.profile_path ? 'https://image.tmdb.org/t/p/w185' + actor.profile_path : PLACEHOLDER_IMG}" alt="${actor.name}" loading="lazy" />
          <span>${actor.name}</span>
        </div>
      `).join('');
      castContainer.innerHTML = `<h3>Top Cast</h3><div class="cast-grid">${castHtml}</div>`;
    }
  }
}

/* TV Seasons & Episodes */
async function loadTVSeasons(tvId, targetSeason = 1, targetEpisode = 1) {
  const seasonSelect = document.getElementById('season-select');
  if (!seasonSelect) return;
  seasonSelect.innerHTML = '';

  let data = showDetailsCache[tvId];
  if (!data) {
    data = await tmdbFetch(`/tv/${tvId}`);
    if (data) showDetailsCache[tvId] = data;
  }

  if (data && data.seasons) {
    data.seasons.forEach(season => {
      if (season.season_number <= 0) return;
      const option = document.createElement('option');
      option.value = season.season_number;
      option.textContent = season.name || `Season ${season.season_number}`;
      if (season.season_number === targetSeason) option.selected = true;
      seasonSelect.appendChild(option);
    });
  }

  currentSeason = targetSeason;
  currentEpisode = targetEpisode;
  await loadEpisodes(tvId, targetSeason);
}

async function loadEpisodes(tvId, seasonNumber) {
  const fetchToken = ++episodeFetchToken;
  const episodesContainer = document.getElementById('episodes-container');
  if (!episodesContainer) return;
  episodesContainer.innerHTML = '';

  const cacheKey = `${tvId}_${seasonNumber}`;
  let data = episodeCache[cacheKey];
  if (!data) {
    data = await tmdbFetch(`/tv/${tvId}/season/${seasonNumber}`);
    if (data) episodeCache[cacheKey] = data;
  }

  if (fetchToken !== episodeFetchToken) return;

  if (data && data.episodes) {
    data.episodes.forEach(ep => {
      const btn = document.createElement('button');
      btn.className = `episode-btn ${ep.episode_number === currentEpisode ? 'active' : ''}`;
      btn.textContent = `Ep ${ep.episode_number}`;
      btn.onclick = () => {
        document.querySelectorAll('.episode-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentEpisode = ep.episode_number;
        loadVideo();
        saveCurrentProgress();
      };
      episodesContainer.appendChild(btn);
    });
  }
  loadVideo();
}

function onSeasonChange() {
  const select = document.getElementById('season-select');
  if (!select) return;
  currentEpisode = 1;
  loadEpisodes(currentItem.id, parseInt(select.value, 10));
}

function closeModal() {
  const iframe = document.getElementById('modal-video');
  if (iframe) iframe.src = 'about:blank';

  const modal = document.getElementById('modal');
  if (modal) modal.classList.remove('active');
  unlockBodyScroll();

  if (openedFromGrid) {
    const gridModal = document.getElementById('grid-modal');
    if (gridModal) gridModal.classList.add('active');
  }
}

/* Share Feature */
function shareCurrentItem() {
  if (!currentItem) return;
  const title = currentItem.title || currentItem.name;
  const shareData = {
    title: `Watch ${title} on StreamVault`,
    text: `Check out "${title}" on StreamVault Cinema!`,
    url: window.location.href
  };

  if (navigator.share) {
    navigator.share(shareData).catch(() => {});
  } else {
    navigator.clipboard.writeText(window.location.href);
    showToast('Link copied to clipboard!', 'fa-link');
  }
}

/* Watchlist & History */
function getWatchlist() {
  try { return JSON.parse(localStorage.getItem('myList')) || []; } catch { return []; }
}

function isItemInWatchlist(id) {
  return getWatchlist().some(i => i.id === id);
}

function updateWatchlistBadge() {
  const badge = document.getElementById('watchlist-badge');
  if (!badge) return;
  const count = getWatchlist().length;
  badge.textContent = count;
  badge.style.display = count > 0 ? 'inline-block' : 'none';
}

function toggleWatchlist() {
  if (!currentItem) return;
  let list = getWatchlist();
  const index = list.findIndex(i => i.id === currentItem.id);

  if (index > -1) {
    list.splice(index, 1);
    showToast('Removed from My List', 'fa-trash');
  } else {
    list.push(currentItem);
    showToast('Added to My List!', 'fa-bookmark');
  }

  localStorage.setItem('myList', JSON.stringify(list));
  updateWatchlistButton();
  renderWatchlistRow();
}

function updateWatchlistButton() {
  const btn = document.getElementById('watchlist-btn');
  if (!btn || !currentItem) return;
  const inList = isItemInWatchlist(currentItem.id);
  btn.textContent = inList ? 'Remove from List' : 'Add to List';
  btn.classList.toggle('remove', inList);
}

function renderWatchlistRow() {
  const list = getWatchlist();
  const row = document.getElementById('watchlist-row');
  if (!row) return;
  row.style.display = list.length ? 'block' : 'none';
  if (list.length) displayList(list, 'watchlist-list', 'movie');
  updateWatchlistBadge();
}

function clearWatchlist() {
  localStorage.removeItem('myList');
  renderWatchlistRow();
  showToast('Watchlist cleared', 'fa-trash');
}

function getContinueWatching() {
  try { return JSON.parse(localStorage.getItem('continueWatching')) || []; } catch { return []; }
}

function saveCurrentProgress() {
  if (!currentItem) return;
  let list = getContinueWatching();
  const existingIndex = list.findIndex(i => i.id === currentItem.id);

  const itemData = {
    ...currentItem,
    savedSeason: currentSeason,
    savedEpisode: currentEpisode,
    lastWatched: Date.now()
  };

  if (existingIndex > -1) list.splice(existingIndex, 1);
  list.unshift(itemData);
  if (list.length > 15) list.pop();

  localStorage.setItem('continueWatching', JSON.stringify(list));
  renderContinueWatchingRow();
}

function renderContinueWatchingRow() {
  const list = getContinueWatching();
  const row = document.getElementById('continue-row');
  if (!row) return;
  row.style.display = list.length ? 'block' : 'none';
  if (list.length) displayList(list, 'continue-list', 'movie');
}

function clearContinueWatching() {
  localStorage.removeItem('continueWatching');
  renderContinueWatchingRow();
  showToast('Watch history cleared', 'fa-trash');
}

/* Category & Genre Filtering */
function filterContent(category, btnEl) {
  currentTabCategory = category;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  if (btnEl) btnEl.classList.add('active');

  const genreTabs = document.getElementById('genre-tabs');
  if (genreTabs) genreTabs.style.display = (category === 'movie' || category === 'tv') ? 'flex' : 'none';

  const rows = ['continue', 'watchlist', 'movies', 'tv', 'anime', 'tagalog', 'kdrama'];
  rows.forEach(r => {
    const el = document.getElementById(`${r}-row`);
    if (el) el.style.display = 'none';
  });

  if (category === 'all') {
    if (getContinueWatching().length) document.getElementById('continue-row').style.display = 'block';
    if (getWatchlist().length) document.getElementById('watchlist-row').style.display = 'block';
    ['movies', 'tv', 'anime', 'tagalog', 'kdrama'].forEach(r => document.getElementById(`${r}-row`).style.display = 'block');
  } else if (category === 'movie') {
    ['movies', 'tagalog'].forEach(r => document.getElementById(`${r}-row`).style.display = 'block');
  } else if (category === 'tv') {
    ['tv', 'kdrama'].forEach(r => document.getElementById(`${r}-row`).style.display = 'block');
  } else if (category === 'anime') {
    document.getElementById('anime-row').style.display = 'block';
  }
}

async function filterByGenre(genreId, btnEl) {
  document.querySelectorAll('.genre-btn').forEach(b => b.classList.remove('active'));
  if (btnEl) btnEl.classList.add('active');

  const isMovie = currentTabCategory === 'movie';
  const targetList = isMovie ? 'movies-list' : 'tvshows-list';

  if (genreId === 'all') {
    displayList(isMovie ? fullDataCache.movies : fullDataCache.tv, targetList, isMovie ? 'movie' : 'tv');
    return;
  }

  const data = await tmdbFetch(isMovie ? '/discover/movie' : '/discover/tv', { with_genres: genreId, sort_by: 'popularity.desc' });
  if (data && data.results) {
    data.results.forEach(i => i.media_type = isMovie ? 'movie' : 'tv');
    displayList(data.results, targetList, isMovie ? 'movie' : 'tv');
  }
}

/* =========================================================
   SEE ALL GRID MODAL ENGINE
========================================================= */

function openGridModal(category) {
  const modal = document.getElementById('grid-modal');
  const titleEl = document.getElementById('grid-modal-title');
  const container = document.getElementById('grid-modal-results');
  if (!modal || !container) return;

  gridCategory = category;
  gridPage = 1;
  gridHasMore = true;
  openedFromGrid = true;

  const titles = {
    movies: 'Trending Movies',
    tv: 'Trending TV Shows',
    anime: 'Trending Anime',
    tagalog: 'Trending Tagalog Movies',
    kdrama: 'Trending K-Dramas'
  };

  if (titleEl) titleEl.textContent = titles[category] || 'Category';
  container.innerHTML = '';
  modal.classList.add('active');
  lockBodyScroll();

  loadGridPage();
}

async function loadGridPage() {
  if (gridLoading || !gridHasMore) return;
  gridLoading = true;

  const container = document.getElementById('grid-modal-results');
  if (!container) return;

  const data = await tmdbFetch(gridCategory === 'movies' ? '/trending/movie/week' : '/trending/tv/week', { page: gridPage });
  gridLoading = false;

  if (data && data.results) {
    data.results.forEach(item => {
      if (!item.poster_path) return;
      const card = document.createElement('div');
      card.className = 'movie-card';
      card.innerHTML = `<img src="${getPosterUrl(item.poster_path)}" alt="${item.title || item.name}" />`;
      card.onclick = () => {
        document.getElementById('grid-modal').classList.remove('active');
        showDetails(item);
      };
      container.appendChild(card);
    });
    gridPage++;
  }
}

function closeGridModal() {
  document.getElementById('grid-modal').classList.remove('active');
  unlockBodyScroll();
  openedFromGrid = false;
}

/* =========================================================
   SEARCH ENGINE WITH HISTORY
========================================================= */

function openSearchModal() {
  const modal = document.getElementById('search-modal');
  const input = document.getElementById('search-input');
  if (modal) modal.classList.add('active');
  lockBodyScroll();
  renderRecentSearches();
  if (input) setTimeout(() => input.focus(), 100);
}

function closeSearchModal() {
  document.getElementById('search-modal').classList.remove('active');
  unlockBodyScroll();
}

function debounceSearch() {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(searchTMDB, 300);
}

async function searchTMDB() {
  const input = document.getElementById('search-input');
  const container = document.getElementById('search-results');
  if (!input || !container) return;

  const query = input.value.trim();
  if (!query) { container.innerHTML = ''; return; }

  saveRecentSearch(query);

  const data = await tmdbFetch('/search/multi', { query });
  if (!data || !data.results) return;

  container.innerHTML = '';
  const results = data.results.filter(i => i.poster_path && i.media_type !== 'person');

  results.forEach(item => {
    const card = document.createElement('div');
    card.className = 'movie-card';
    card.innerHTML = `<img src="${getPosterUrl(item.poster_path)}" alt="${item.title || item.name}" />`;
    card.onclick = () => {
      closeSearchModal();
      showDetails(item);
    };
    container.appendChild(card);
  });
}

function saveRecentSearch(query) {
  let searches = JSON.parse(localStorage.getItem('recentSearches')) || [];
  if (!searches.includes(query)) {
    searches.unshift(query);
    if (searches.length > 5) searches.pop();
    localStorage.setItem('recentSearches', JSON.stringify(searches));
  }
}

function renderRecentSearches() {
  const container = document.getElementById('recent-searches');
  if (!container) return;
  let searches = JSON.parse(localStorage.getItem('recentSearches')) || [];
  container.innerHTML = searches.map(s => `<span class="recent-search-tag" onclick="quickSearch('${s}')">${s}</span>`).join('');
}

function quickSearch(query) {
  const input = document.getElementById('search-input');
  if (input) {
    input.value = query;
    searchTMDB();
  }
}

/* =========================================================
   INITIALIZATION & KEYBOARD SHORTCUTS
========================================================= */

async function init() {
  try {
    const [movies, tvShows, anime, tagalogMovies, kDramas] = await Promise.all([
      fetchTrending('movie'),
      fetchTrending('tv'),
      fetchTrendingAnime(),
      fetchTagalog(),
      fetchKDramas()
    ]);

    fullDataCache = { movies, tv: tvShows, anime, tagalog: tagalogMovies, kdrama: kDramas };

    if (movies.length > 0) setupBannerCarousel(movies);

    displayList(movies, 'movies-list', 'movie');
    displayList(tvShows, 'tvshows-list', 'tv');
    displayList(anime, 'anime-list', 'tv');
    displayList(tagalogMovies, 'tagalog-list', 'movie');
    displayList(kDramas, 'kdrama-list', 'tv');

    renderWatchlistRow();
    renderContinueWatchingRow();
  } catch (error) {
    console.error('Initialization error:', error);
  }
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeModal();
    closeGridModal();
    closeSearchModal();
  }
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault();
    openSearchModal();
  }
  if (e.key === '/' && document.activeElement.tagName !== 'INPUT') {
    e.preventDefault();
    openSearchModal();
  }
});

init();
