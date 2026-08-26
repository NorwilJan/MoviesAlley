/* =========================================================
   STREAMVAULT — COMPLETE JS ENGINE
========================================================= */

const CONFIG = Object.freeze({
  API_KEY: 'c5f2e226dd2ee0c8ed2c272a0ebaf049',
  BASE_URL: 'https://api.themoviedb.org/3',
  POSTER_URL: 'https://image.tmdb.org/t/p/w342',
  MODAL_POSTER_URL: 'https://image.tmdb.org/t/p/w500',
  BACKDROP_URL: 'https://image.tmdb.org/t/p/original',
  CACHE_TTL: 2 * 60 * 60 * 1000, // 2 Hours
  PLACEHOLDER_IMG: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="130" height="195" fill="%231a1a1a"><rect width="100%" height="100%"/></svg>'
});

// Category endpoints mapping
const CATEGORY_MAP = {
  movies: { endpoint: '/trending/movie/week', mediaType: 'movie', title: 'Trending Movies' },
  tv: { endpoint: '/trending/tv/week', mediaType: 'tv', title: 'Trending TV Shows' },
  anime: { endpoint: '/discover/tv', params: { with_original_language: 'ja', with_genres: 16, sort_by: 'popularity.desc' }, mediaType: 'tv', title: 'Popular Anime' },
  tagalog: { endpoint: '/discover/movie', params: { with_original_language: 'tl', sort_by: 'popularity.desc' }, mediaType: 'movie', title: 'Filipino Cinema' },
  kdrama: { endpoint: '/discover/tv', params: { with_original_language: 'ko', sort_by: 'popularity.desc' }, mediaType: 'tv', title: 'Korean Dramas' }
};

// State Management
const state = {
  currentItem: null,
  bannerItem: null,
  currentSeason: 1,
  currentEpisode: 1,
  currentTabCategory: 'all',
  currentServer: 'videasy',
  gridCategory: null,
  gridPage: 1,
  gridLoading: false,
  gridHasMore: true,
  gridSelectedGenre: 'all',
  openedFromGrid: false
};

// Internal Caches
const caches = {
  showDetails: new Map(),
  episodes: new Map(),
  fullData: { movies: [], tv: [], anime: [], tagalog: [], kdrama: [] }
};

let searchTimeout = null;
let episodeFetchToken = 0;

/* =========================================================
   DOM CACHE REFERENCE
========================================================= */
const DOM = {};

function initDOMReferences() {
  DOM.banner = document.getElementById('banner');
  DOM.bannerTitle = document.getElementById('banner-title');
  DOM.modal = document.getElementById('modal');
  DOM.modalTitle = document.getElementById('modal-title');
  DOM.modalDesc = document.getElementById('modal-description');
  DOM.modalImg = document.getElementById('modal-image');
  DOM.modalRating = document.getElementById('modal-rating');
  DOM.modalVideo = document.getElementById('modal-video');
  DOM.watchlistBadge = document.getElementById('watchlist-badge');
  DOM.watchlistBtn = document.getElementById('watchlist-btn');
  DOM.gridModal = document.getElementById('grid-modal');
  DOM.gridModalTitle = document.getElementById('grid-modal-title');
  DOM.gridResults = document.getElementById('grid-modal-results');
  DOM.gridScrollArea = document.getElementById('grid-scroll-area');
  DOM.genreTabs = document.getElementById('genre-tabs');
  DOM.searchModal = document.getElementById('search-modal');
  DOM.searchInput = document.getElementById('search-input');
  DOM.searchResults = document.getElementById('search-results');
}

/* =========================================================
   CACHE HELPERS
========================================================= */

function getCachedApiData(key) {
  try {
    const raw = localStorage.getItem(`sv_cache_${key}`);
    if (!raw) return null;
    const { data, timestamp } = JSON.parse(raw);
    if (Date.now() - timestamp < CONFIG.CACHE_TTL) return data;
    localStorage.removeItem(`sv_cache_${key}`);
  } catch (e) {
    console.error('LocalStorage Read Error:', e);
  }
  return null;
}

function setCachedApiData(key, data) {
  try {
    localStorage.setItem(`sv_cache_${key}`, JSON.stringify({ data, timestamp: Date.now() }));
  } catch (e) {
    console.error('LocalStorage Write Error:', e);
  }
}

/* =========================================================
   SCROLL LOCK
========================================================= */

function toggleBodyScroll(lock) {
  document.documentElement.classList.toggle('modal-open', lock);
  document.body.classList.toggle('modal-open', lock);
}

/* =========================================================
   API FETCH ENGINE
========================================================= */

async function tmdbFetch(endpoint, params = {}) {
  try {
    const url = new URL(`${CONFIG.BASE_URL}${endpoint}`);
    url.searchParams.set('api_key', CONFIG.API_KEY);
    Object.entries(params).forEach(([k, v]) => v && url.searchParams.set(k, v));

    const res = await fetch(url.toString());
    return res.ok ? await res.json() : null;
  } catch (err) {
    console.error('TMDB API Error:', err);
    return null;
  }
}

async function fetchCategory(key, endpoint, params = {}) {
  const cached = getCachedApiData(key);
  if (cached) return cached;

  const data = await tmdbFetch(endpoint, params);
  const results = data?.results || [];
  if (results.length) setCachedApiData(key, results);
  return results;
}

/* =========================================================
   UI RENDERING & EVENT DELEGATION
========================================================= */

function createPosterCard(item, mediaType) {
  const img = document.createElement('img');
  img.className = 'poster-card';
  img.src = item.poster_path ? `${CONFIG.POSTER_URL}${item.poster_path}` : CONFIG.PLACEHOLDER_IMG;
  img.alt = item.title || item.name || 'Poster';
  img.loading = 'lazy';
  img.decoding = 'async';
  img.setAttribute('role', 'button');
  img.setAttribute('tabindex', '0');

  img.dataset.item = JSON.stringify({
    id: item.id,
    title: item.title || item.name,
    overview: item.overview,
    poster_path: item.poster_path,
    backdrop_path: item.backdrop_path,
    vote_average: item.vote_average,
    media_type: item.media_type || mediaType
  });

  return img;
}

function displayList(items, containerId, mediaType) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = '';
  const fragment = document.createDocumentFragment();

  items.slice(0, 20).forEach(item => {
    if (item.poster_path) fragment.appendChild(createPosterCard(item, mediaType));
  });

  container.appendChild(fragment);
  setupContainerDelegation(container);
}

function setupContainerDelegation(container) {
  if (container.dataset.delegated) return;
  container.dataset.delegated = 'true';

  let isDragging = false;
  let startX = 0;
  let scrollLeft = 0;

  container.addEventListener('mousedown', (e) => {
    isDragging = false;
    startX = e.pageX - container.offsetLeft;
    scrollLeft = container.scrollLeft;
    container.classList.add('dragging');
  });

  container.addEventListener('mousemove', (e) => {
    if (!container.classList.contains('dragging')) return;
    const x = e.pageX - container.offsetLeft;
    if (Math.abs(x - startX) > 5) isDragging = true;
    container.scrollLeft = scrollLeft - (x - startX) * 1.2;
  });

  const stopDrag = () => container.classList.remove('dragging');
  container.addEventListener('mouseup', stopDrag);
  container.addEventListener('mouseleave', stopDrag);

  container.addEventListener('click', (e) => {
    if (isDragging) return;
    const card = e.target.closest('.poster-card');
    if (card && card.dataset.item) {
      showDetails(JSON.parse(card.dataset.item));
    }
  });
}

function scrollList(containerId, direction) {
  const container = document.getElementById(containerId);
  if (container) {
    container.scrollBy({ left: direction * 500, behavior: 'smooth' });
  }
}

/* Filter homepage categories */
function filterContent(category, btn) {
  state.currentTabCategory = category;
  document.querySelectorAll('.nav-links a').forEach(a => a.classList.remove('active'));
  if (btn) btn.classList.add('active');

  const rows = {
    movies: document.getElementById('movies-row'),
    tv: document.getElementById('tvshows-row'),
    anime: document.getElementById('anime-row'),
    tagalog: document.getElementById('tagalog-row'),
    kdrama: document.getElementById('kdrama-row')
  };

  Object.entries(rows).forEach(([key, row]) => {
    if (!row) return;
    if (category === 'all') {
      row.style.display = 'block';
    } else if (category === 'movie') {
      row.style.display = (key === 'movies' || key === 'tagalog') ? 'block' : 'none';
    } else if (category === 'tv') {
      row.style.display = (key === 'tv' || key === 'kdrama') ? 'block' : 'none';
    } else if (category === 'anime') {
      row.style.display = key === 'anime' ? 'block' : 'none';
    }
  });
}

/* =========================================================
   BANNER & DETAILS MODAL
========================================================= */

function displayBanner(item) {
  if (!item?.backdrop_path || !DOM.banner) return;
  state.bannerItem = item;
  DOM.banner.style.backgroundImage = `linear-gradient(to top, #070707 10%, rgba(7,7,7,0.4) 60%, rgba(7,7,7,0.85)), url(${CONFIG.BACKDROP_URL}${item.backdrop_path})`;
  if (DOM.bannerTitle) DOM.bannerTitle.textContent = item.title || item.name;
}

function playBanner() {
  if (state.bannerItem) {
    state.openedFromGrid = false;
    showDetails(state.bannerItem);
  }
}

async function showDetails(item) {
  state.currentItem = item;
  const history = getContinueWatching();
  const saved = history.find(i => i.id === item.id);

  state.currentSeason = saved?.savedSeason || 1;
  state.currentEpisode = saved?.savedEpisode || 1;

  if (DOM.modalTitle) DOM.modalTitle.textContent = item.title || item.name || '';
  if (DOM.modalDesc) DOM.modalDesc.textContent = item.overview || 'No description available.';
  if (DOM.modalImg) DOM.modalImg.src = item.poster_path ? `${CONFIG.MODAL_POSTER_URL}${item.poster_path}` : CONFIG.PLACEHOLDER_IMG;

  if (DOM.modalRating) {
    const stars = item.vote_average ? Math.round(item.vote_average / 2) : 0;
    DOM.modalRating.textContent = '★'.repeat(stars) + '☆'.repeat(5 - stars);
  }

  updateWatchlistButton();
  saveCurrentProgress();

  const isTv = item.media_type === 'tv' || !item.title;
  const seriesOptions = document.getElementById('series-options');
  if (seriesOptions) seriesOptions.style.display = isTv ? 'flex' : 'none';

  if (DOM.gridModal?.classList.contains('active')) {
    state.openedFromGrid = true;
    DOM.gridModal.classList.remove('active');
  }

  if (DOM.modal) {
    DOM.modal.classList.add('active');
    toggleBodyScroll(true);
  }

  if (isTv) {
    await loadTVSeasons(item.id, state.currentSeason, state.currentEpisode);
  } else {
    loadVideo();
  }

  renderExtraDetails(item);
}

function loadVideo() {
  if (!state.currentItem || !DOM.modalVideo) return;
  const isTv = state.currentItem.media_type === 'tv' || !state.currentItem.title;
  let embedURL = '';

  if (state.currentServer === 'vidsrc') {
    embedURL = isTv 
      ? `https://vidsrc.xyz/embed/tv?tmdb=${state.currentItem.id}&season=${state.currentSeason}&episode=${state.currentEpisode}`
      : `https://vidsrc.xyz/embed/movie?tmdb=${state.currentItem.id}`;
  } else if (state.currentServer === 'vidsrcpro') {
    embedURL = isTv 
      ? `https://vidsrc.pro/embed/tv/${state.currentItem.id}/${state.currentSeason}/${state.currentEpisode}`
      : `https://vidsrc.pro/embed/movie/${state.currentItem.id}`;
  } else {
    embedURL = isTv 
      ? `https://player.videasy.net/tv/${state.currentItem.id}/${state.currentSeason}/${state.currentEpisode}`
      : `https://player.videasy.net/movie/${state.currentItem.id}`;
  }

  if (DOM.modalVideo.src !== embedURL) DOM.modalVideo.src = embedURL;
}

function switchServer(serverName) {
  state.currentServer = serverName;
  document.querySelectorAll('.server-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.server === serverName);
  });
  loadVideo();
}

async function renderExtraDetails(item) {
  const trailerContainer = document.getElementById('modal-trailer-container');
  const castContainer = document.getElementById('modal-cast-container');
  if (trailerContainer) trailerContainer.innerHTML = '';
  if (castContainer) castContainer.innerHTML = '';

  const isTv = item.media_type === 'tv' || !item.title;
  const data = await tmdbFetch(`/${isTv ? 'tv' : 'movie'}/${item.id}`, { append_to_response: 'credits,videos' });
  if (!data) return;

  if (data.videos?.results && trailerContainer) {
    const trailer = data.videos.results.find(v => v.type === 'Trailer' && v.site === 'YouTube');
    if (trailer) {
      trailerContainer.innerHTML = `
        <h3 style="margin-top:20px; font-size:1.1rem;">Official Trailer</h3>
        <div class="video-container" style="margin-top:10px;">
          <iframe src="https://www.youtube-nocookie.com/embed/${trailer.key}" allowfullscreen loading="lazy"></iframe>
        </div>`;
    }
  }

  if (data.credits?.cast?.length && castContainer) {
    const castItems = data.credits.cast.slice(0, 10).map(actor => `
      <div class="cast-item">
        <img src="${actor.profile_path ? `https://image.tmdb.org/t/p/w185${actor.profile_path}` : CONFIG.PLACEHOLDER_IMG}" alt="${actor.name}" loading="lazy" />
        <span>${actor.name}</span>
      </div>`).join('');

    castContainer.innerHTML = `<h3 style="margin-top:20px; font-size:1.1rem; margin-bottom:10px;">Top Cast</h3><div class="cast-grid">${castItems}</div>`;
  }
}

/* =========================================================
   TV SEASONS & EPISODES
========================================================= */

async function loadTVSeasons(tvId, targetSeason = 1, targetEpisode = 1) {
  const select = document.getElementById('season-select');
  if (!select) return;
  select.innerHTML = '';

  let data = caches.showDetails.get(tvId);
  if (!data) {
    data = await tmdbFetch(`/tv/${tvId}`);
    if (data) caches.showDetails.set(tvId, data);
  }

  if (data?.seasons) {
    data.seasons.forEach(season => {
      if (season.season_number <= 0) return;
      const option = document.createElement('option');
      option.value = season.season_number;
      option.textContent = season.name || `Season ${season.season_number}`;
      if (season.season_number === targetSeason) option.selected = true;
      select.appendChild(option);
    });
  }

  state.currentSeason = targetSeason;
  state.currentEpisode = targetEpisode;
  await loadEpisodes(tvId, targetSeason);
}

async function loadEpisodes(tvId, seasonNumber) {
  const token = ++episodeFetchToken;
  state.currentSeason = seasonNumber;
  const container = document.getElementById('episodes-container');
  if (!container) return;
  container.innerHTML = '';

  const cacheKey = `${tvId}_${seasonNumber}`;
  let data = caches.episodes.get(cacheKey);
  if (!data) {
    data = await tmdbFetch(`/tv/${tvId}/season/${seasonNumber}`);
    if (data) caches.episodes.set(cacheKey, data);
  }

  if (token !== episodeFetchToken) return;

  if (data?.episodes?.length) {
    const fragment = document.createDocumentFragment();
    data.episodes.forEach(ep => {
      const btn = document.createElement('button');
      btn.className = `episode-btn ${ep.episode_number === state.currentEpisode ? 'active' : ''}`;
      btn.textContent = `Ep ${ep.episode_number}`;
      btn.onclick = () => {
        container.querySelectorAll('.episode-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.currentEpisode = ep.episode_number;
        loadVideo();
        saveCurrentProgress();
      };
      fragment.appendChild(btn);
    });
    container.appendChild(fragment);
  }
  loadVideo();
}

function onSeasonChange() {
  const select = document.getElementById('season-select');
  if (!select || !state.currentItem) return;
  state.currentEpisode = 1;
  loadEpisodes(state.currentItem.id, parseInt(select.value, 10));
}

function closeModal() {
  if (DOM.modalVideo) DOM.modalVideo.src = 'about:blank';
  if (DOM.modal) DOM.modal.classList.remove('active');
  toggleBodyScroll(false);

  if (state.openedFromGrid && DOM.gridModal) {
    DOM.gridModal.classList.add('active');
    toggleBodyScroll(true);
  }
}

/* =========================================================
   SEE ALL GRID MODAL & INFINITE SCROLL
========================================================= */

function openGridModal(categoryKey) {
  state.gridCategory = categoryKey;
  state.gridPage = 1;
  state.gridHasMore = true;
  state.gridSelectedGenre = 'all';

  if (DOM.gridResults) DOM.gridResults.innerHTML = '';
  if (DOM.gridModalTitle) {
    DOM.gridModalTitle.textContent = categoryKey === 'watchlist' ? 'My List' : (CATEGORY_MAP[categoryKey]?.title || 'Browse All');
  }

  if (DOM.genreTabs) {
    DOM.genreTabs.style.display = categoryKey === 'watchlist' ? 'none' : 'flex';
    renderGenreTabs();
  }

  if (DOM.gridModal) {
    DOM.gridModal.classList.add('active');
    toggleBodyScroll(true);
  }

  loadGridItems();
}

function closeGridModal() {
  if (DOM.gridModal) DOM.gridModal.classList.remove('active');
  toggleBodyScroll(false);
  state.openedFromGrid = false;
}

function renderGenreTabs() {
  if (!DOM.genreTabs) return;
  const genres = [
    { id: 'all', name: 'All' },
    { id: '28', name: 'Action' },
    { id: '35', name: 'Comedy' },
    { id: '18', name: 'Drama' },
    { id: '878', name: 'Sci-Fi' },
    { id: '27', name: 'Horror' }
  ];

  DOM.genreTabs.innerHTML = genres.map(g => `
    <button class="genre-btn ${g.id === state.gridSelectedGenre ? 'active' : ''}" onclick="selectGridGenre('${g.id}')">
      ${g.name}
    </button>
  `).join('');
}

function selectGridGenre(genreId) {
  state.gridSelectedGenre = genreId;
  state.gridPage = 1;
  state.gridHasMore = true;
  if (DOM.gridResults) DOM.gridResults.innerHTML = '';
  renderGenreTabs();
  loadGridItems();
}

async function loadGridItems() {
  if (state.gridLoading || !state.gridHasMore) return;
  state.gridLoading = true;

  if (state.gridCategory === 'watchlist') {
    const list = getWatchlist();
    if (DOM.gridResults) {
      DOM.gridResults.innerHTML = '';
      const fragment = document.createDocumentFragment();
      list.forEach(item => fragment.appendChild(createPosterCard(item, item.media_type || 'movie')));
      DOM.gridResults.appendChild(fragment);
      setupContainerDelegation(DOM.gridResults);
    }
    state.gridHasMore = false;
    state.gridLoading = false;
    return;
  }

  const cat = CATEGORY_MAP[state.gridCategory];
  if (!cat) { state.gridLoading = false; return; }

  const params = { page: state.gridPage, ...(cat.params || {}) };
  if (state.gridSelectedGenre !== 'all') params.with_genres = state.gridSelectedGenre;

  const data = await tmdbFetch(cat.endpoint, params);
  const results = data?.results || [];

  if (results.length && DOM.gridResults) {
    const fragment = document.createDocumentFragment();
    results.forEach(item => {
      if (item.poster_path) fragment.appendChild(createPosterCard(item, cat.mediaType));
    });
    DOM.gridResults.appendChild(fragment);
    setupContainerDelegation(DOM.gridResults);
    state.gridPage++;
  } else {
    state.gridHasMore = false;
  }

  state.gridLoading = false;
}

function handleGridScroll() {
  if (!DOM.gridScrollArea || state.gridLoading) return;
  const { scrollTop, scrollHeight, clientHeight } = DOM.gridScrollArea;
  if (scrollTop + clientHeight >= scrollHeight - 300) {
    loadGridItems();
  }
}

/* =========================================================
   WATCHLIST, HISTORY & SURPRISE ME
========================================================= */

function getWatchlist() {
  try { return JSON.parse(localStorage.getItem('myList')) || []; } catch { return []; }
}

function getContinueWatching() {
  try { return JSON.parse(localStorage.getItem('continueWatching')) || []; } catch { return []; }
}

function updateWatchlistBadge() {
  if (!DOM.watchlistBadge) return;
  const count = getWatchlist().length;
  DOM.watchlistBadge.textContent = count;
  DOM.watchlistBadge.style.display = count > 0 ? 'inline-block' : 'none';
}

function toggleWatchlist() {
  if (!state.currentItem) return;
  let list = getWatchlist();
  const idx = list.findIndex(i => i.id === state.currentItem.id);

  if (idx > -1) list.splice(idx, 1);
  else list.push(state.currentItem);

  localStorage.setItem('myList', JSON.stringify(list));
  updateWatchlistButton();
  updateWatchlistBadge();
  renderWatchlistRow();
}

function updateWatchlistButton() {
  if (!DOM.watchlistBtn || !state.currentItem) return;
  const exists = getWatchlist().some(i => i.id === state.currentItem.id);
  DOM.watchlistBtn.textContent = exists ? 'Remove from List' : 'Add to List';
  DOM.watchlistBtn.classList.toggle('remove', exists);
}

function renderWatchlistRow() {
  const list = getWatchlist();
  const row = document.getElementById('watchlist-row');
  if (row) {
    row.style.display = list.length ? 'block' : 'none';
    if (list.length) displayList(list, 'watchlist-list', 'movie');
  }
  updateWatchlistBadge();
}

function clearWatchlist() {
  localStorage.removeItem('myList');
  renderWatchlistRow();
}

function saveCurrentProgress() {
  if (!state.currentItem) return;
  let list = getContinueWatching();
  const idx = list.findIndex(i => i.id === state.currentItem.id);

  const payload = {
    ...state.currentItem,
    savedSeason: state.currentSeason,
    savedEpisode: state.currentEpisode,
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

function clearContinueWatching() {
  localStorage.removeItem('continueWatching');
  renderContinueWatchingRow();
}

function surpriseMe() {
  const pool = [...caches.fullData.movies, ...caches.fullData.tv, ...caches.fullData.anime];
  if (pool.length) {
    const randomItem = pool[Math.floor(Math.random() * pool.length)];
    state.openedFromGrid = false;
    showDetails(randomItem);
  }
}

function shareCurrentItem() {
  if (!state.currentItem) return;
  const title = state.currentItem.title || state.currentItem.name;
  if (navigator.share) {
    navigator.share({ title: `Watch ${title} on StreamVault`, url: window.location.href }).catch(() => {});
  } else {
    navigator.clipboard.writeText(window.location.href);
    alert('Link copied to clipboard!');
  }
}

/* =========================================================
   SEARCH MODAL DEBOUNCED
========================================================= */

function openSearchModal() {
  if (!DOM.searchModal) return;
  DOM.searchModal.classList.add('active');
  toggleBodyScroll(true);
  if (DOM.searchInput) setTimeout(() => DOM.searchInput.focus(), 100);
}

function closeSearchModal() {
  if (!DOM.searchModal) return;
  DOM.searchModal.classList.remove('active');
  toggleBodyScroll(false);
  if (DOM.searchResults) DOM.searchResults.innerHTML = '';
  if (DOM.searchInput) DOM.searchInput.value = '';
}

function debounceSearch() {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(searchTMDB, 300);
}

async function searchTMDB() {
  if (!DOM.searchInput || !DOM.searchResults) return;
  const query = DOM.searchInput.value.trim();
  if (!query) { DOM.searchResults.innerHTML = ''; return; }

  const data = await tmdbFetch('/search/multi', { query });
  const results = (data?.results || []).filter(item => item.poster_path && item.media_type !== 'person');

  DOM.searchResults.innerHTML = '';
  if (!results.length) {
    DOM.searchResults.innerHTML = `<p style="grid-column:1/-1; text-align:center; color:#777; padding:40px 0;">No results found.</p>`;
    return;
  }

  const fragment = document.createDocumentFragment();
  results.forEach(item => {
    fragment.appendChild(createPosterCard(item, item.media_type || (item.title ? 'movie' : 'tv')));
  });
  DOM.searchResults.appendChild(fragment);
  setupContainerDelegation(DOM.searchResults);
}

/* Global Keyboard Handlers */
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeModal();
    closeGridModal();
    closeSearchModal();
  }
});

/* Initialize Application */
async function init() {
  initDOMReferences();
  
  const [movies, tv, anime, tagalog, kdrama] = await Promise.all([
    fetchCategory('tr_movies', CATEGORY_MAP.movies.endpoint),
    fetchCategory('tr_tv', CATEGORY_MAP.tv.endpoint),
    fetchCategory('tr_anime', CATEGORY_MAP.anime.endpoint, CATEGORY_MAP.anime.params),
    fetchCategory('tr_tagalog', CATEGORY_MAP.tagalog.endpoint, CATEGORY_MAP.tagalog.params),
    fetchCategory('tr_kdrama', CATEGORY_MAP.kdrama.endpoint, CATEGORY_MAP.kdrama.params)
  ]);

  caches.fullData = { movies, tv, anime, tagalog, kdrama };

  if (movies.length) displayBanner(movies[Math.floor(Math.random() * Math.min(5, movies.length))]);

  displayList(movies, 'movies-list', 'movie');
  displayList(tv, 'tvshows-list', 'tv');
  displayList(anime, 'anime-list', 'tv');
  displayList(tagalog, 'tagalog-list', 'movie');
  displayList(kdrama, 'kdrama-list', 'tv');

  renderWatchlistRow();
  renderContinueWatchingRow();
}

document.addEventListener('DOMContentLoaded', init);
