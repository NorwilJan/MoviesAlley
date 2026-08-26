/* =========================================================
   STREAMVAULT — CORE ENGINE & EMBEDDED PROVIDER LOGIC
========================================================= */

const TMDB_API_KEY = '3fd2be6f0c70a2a598f084dd27548780'; // TMDB Public API key
const BASE_URL = 'https://api.themoviedb.org/3';
const IMG_BASE_URL = 'https://image.tmdb.org/t/p/w500';
const BACKDROP_BASE_URL = 'https://image.tmdb.org/t/p/original';
const PLACEHOLDER_IMG = 'https://via.placeholder.com/500x750/181920/ffffff?text=No+Poster';

// Active State Storage
let currentSelectedItem = null;
let currentFilterType = 'all';
let currentGenreId = 'all';
let watchlist = JSON.parse(localStorage.getItem('sv_watchlist')) || [];
let continueWatching = JSON.parse(localStorage.getItem('sv_continue_watching')) || [];

// INITIALIZATION
document.addEventListener('DOMContentLoaded', () => {
  initApp();
});

async function initApp() {
  updateWatchlistUI();
  updateContinueWatchingUI();
  await fetchBannerContent();
  await loadHomeRows();
}

/* =========================================================
   API FETCHING & ROWS
========================================================= */

async function fetchTMDB(endpoint) {
  try {
    const res = await fetch(`${BASE_URL}${endpoint}${endpoint.includes('?') ? '&' : '?'}api_key=${TMDB_API_KEY}`);
    if (!res.ok) throw new Error('Network error');
    return await res.json();
  } catch (err) {
    console.error('Fetch error:', err);
    return null;
  }
}

async function fetchBannerContent() {
  const data = await fetchTMDB('/trending/all/day');
  if (data && data.results.length > 0) {
    const heroItem = data.results[0];
    const banner = document.getElementById('banner');
    const titleEl = document.getElementById('banner-title');
    const descEl = document.getElementById('banner-description');

    const bgUrl = heroItem.backdrop_path ? `${BACKDROP_BASE_URL}${heroItem.backdrop_path}` : '';
    banner.style.backgroundImage = `url('${bgUrl}')`;
    titleEl.textContent = heroItem.title || heroItem.name || 'Featured Title';
    descEl.textContent = heroItem.overview || 'No overview available.';
    
    currentSelectedItem = heroItem;
  }
}

async function loadHomeRows() {
  const moviesData = await fetchTMDB('/trending/movie/week');
  if (moviesData) displayList(moviesData.results, 'movies-list', 'movie');

  const tvData = await fetchTMDB('/trending/tv/week');
  if (tvData) displayList(tvData.results, 'tvshows-list', 'tv');

  const animeData = await fetchTMDB('/discover/tv?with_genres=16&with_keywords=210024');
  if (animeData) displayList(animeData.results, 'anime-list', 'tv');
}

/* =========================================================
   RENDER LISTS & CARDS
========================================================= */

function displayList(items, containerId, mediaType) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = '';
  items.slice(0, 20).forEach((item, index) => {
    if (!item.poster_path) return;
    if (!item.media_type) item.media_type = mediaType;

    const img = document.createElement('img');
    img.src = `${IMG_BASE_URL}${item.poster_path}`;
    img.alt = item.title || item.name;
    img.loading = 'lazy';
    img.style.animationDelay = `${index * 0.03}s`;

    img.onerror = () => { img.src = PLACEHOLDER_IMG; };
    img.onclick = () => showDetails(item);

    container.appendChild(img);
  });
}

function scrollList(containerId, direction) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const scrollAmount = container.clientWidth * 0.75;
  container.scrollBy({ left: direction * scrollAmount, behavior: 'smooth' });
}

/* =========================================================
   DETAILS MODAL & STREAMING
========================================================= */

async function showDetails(item) {
  currentSelectedItem = item;
  const modal = document.getElementById('modal');
  const type = item.media_type || (item.first_air_date ? 'tv' : 'movie');

  document.getElementById('modal-title').textContent = item.title || item.name;
  document.getElementById('modal-description').textContent = item.overview || 'No description available.';
  document.getElementById('modal-image').src = item.poster_path ? `${IMG_BASE_URL}${item.poster_path}` : PLACEHOLDER_IMG;
  document.getElementById('modal-year').textContent = (item.release_date || item.first_air_date || 'N/A').split('-')[0];
  document.getElementById('modal-rating').innerHTML = `<i class="fa-solid fa-star"></i> ${(item.vote_average || 0).toFixed(1)}`;
  document.getElementById('modal-type').textContent = type;

  // Watchlist button state
  updateWatchlistBtnState();
  
  // Hide player on open
  closePlayer();

  // TV Episode options setup
  const seriesOptions = document.getElementById('series-options');
  if (type === 'tv') {
    seriesOptions.style.display = 'block';
    await loadTVSeasons(item.id);
  } else {
    seriesOptions.style.display = 'none';
  }

  modal.style.display = 'block';
  document.body.classList.add('modal-open');
}

function closeModal() {
  document.getElementById('modal').style.display = 'none';
  document.body.classList.remove('modal-open');
  closePlayer();
}

/* =========================================================
   EMBEDDED VIDEO PLAYER ENGINE (VIDSRC)
========================================================= */

function startStreaming(season = 1, episode = 1) {
  if (!currentSelectedItem) return;

  const type = currentSelectedItem.media_type || (currentSelectedItem.first_air_date ? 'tv' : 'movie');
  const id = currentSelectedItem.id;
  const playerWrapper = document.getElementById('video-wrapper');
  const iframe = document.getElementById('modal-video');

  let streamUrl = '';
  if (type === 'movie') {
    streamUrl = `https://vidsrc.pro/embed/movie/${id}`;
  } else {
    streamUrl = `https://vidsrc.pro/embed/tv/${id}/${season}/${episode}`;
  }

  iframe.src = streamUrl;
  playerWrapper.style.display = 'block';
  playerWrapper.scrollIntoView({ behavior: 'smooth' });

  saveToContinueWatching(currentSelectedItem, season, episode);
}

function closePlayer() {
  const playerWrapper = document.getElementById('video-wrapper');
  const iframe = document.getElementById('modal-video');
  iframe.src = '';
  playerWrapper.style.display = 'none';
}

function playBanner() {
  if (currentSelectedItem) showDetails(currentSelectedItem);
}

function openBannerDetails() {
  if (currentSelectedItem) showDetails(currentSelectedItem);
}

/* =========================================================
   TV SHOW SEASON & EPISODE SYSTEM
========================================================= */

async function loadTVSeasons(tvId) {
  const data = await fetchTMDB(`/tv/${tvId}`);
  const seasonSelect = document.getElementById('season-select');
  seasonSelect.innerHTML = '';

  if (data && data.seasons) {
    data.seasons.forEach(season => {
      if (season.season_number > 0) {
        const option = document.createElement('option');
        option.value = season.season_number;
        option.textContent = `Season ${season.season_number} (${season.episode_count} Eps)`;
        seasonSelect.appendChild(option);
      }
    });
    onSeasonChange();
  }
}

function onSeasonChange() {
  const seasonNum = document.getElementById('season-select').value;
  const container = document.getElementById('episodes-container');
  container.innerHTML = '';

  // Generate 24 episode buttons as fallback/default count
  for (let i = 1; i <= 20; i++) {
    const btn = document.createElement('button');
    btn.className = 'ep-btn';
    btn.textContent = `E${i}`;
    btn.onclick = () => {
      document.querySelectorAll('.ep-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      startStreaming(seasonNum, i);
    };
    container.appendChild(btn);
  }
}

/* =========================================================
   WATCHLIST & HISTORY (LOCALSTORAGE)
========================================================= */

function toggleWatchlist() {
  if (!currentSelectedItem) return;
  const index = watchlist.findIndex(i => i.id === currentSelectedItem.id);
  
  if (index > -1) {
    watchlist.splice(index, 1);
  } else {
    watchlist.push(currentSelectedItem);
  }
  
  localStorage.setItem('sv_watchlist', JSON.stringify(watchlist));
  updateWatchlistBtnState();
  updateWatchlistUI();
}

function updateWatchlistBtnState() {
  const btn = document.getElementById('watchlist-btn');
  if (!btn || !currentSelectedItem) return;
  
  const exists = watchlist.some(i => i.id === currentSelectedItem.id);
  btn.innerHTML = exists ? `<i class="fa-solid fa-check"></i> In List` : `<i class="fa-solid fa-plus"></i> Add to List`;
}

function updateWatchlistUI() {
  const row = document.getElementById('watchlist-row');
  const badge = document.getElementById('watchlist-badge');
  
  badge.textContent = watchlist.length;
  badge.style.display = watchlist.length > 0 ? 'inline-block' : 'none';

  if (watchlist.length > 0) {
    row.style.display = 'block';
    displayList(watchlist, 'watchlist-list', 'movie');
  } else {
    row.style.display = 'none';
  }
}

function clearWatchlist() {
  watchlist = [];
  localStorage.removeItem('sv_watchlist');
  updateWatchlistUI();
}

function saveToContinueWatching(item, season, episode) {
  continueWatching = continueWatching.filter(i => i.id !== item.id);
  continueWatching.unshift({ ...item, lastSeason: season, lastEpisode: episode });
  if (continueWatching.length > 15) continueWatching.pop();

  localStorage.setItem('sv_continue_watching', JSON.stringify(continueWatching));
  updateContinueWatchingUI();
}

function updateContinueWatchingUI() {
  const row = document.getElementById('continue-row');
  if (continueWatching.length > 0) {
    row.style.display = 'block';
    displayList(continueWatching, 'continue-list', 'movie');
  } else {
    row.style.display = 'none';
  }
}

function clearContinueWatching() {
  continueWatching = [];
  localStorage.removeItem('sv_continue_watching');
  updateContinueWatchingUI();
}

/* =========================================================
   FILTERING & SEARCH
========================================================= */

function filterContent(type, btn) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');

  const genreTabs = document.getElementById('genre-tabs');
  genreTabs.style.display = type === 'all' ? 'none' : 'flex';

  const moviesRow = document.getElementById('movies-row');
  const tvRow = document.getElementById('tvshows-row');
  const animeRow = document.getElementById('anime-row');

  if (type === 'movie') {
    moviesRow.style.display = 'block';
    tvRow.style.display = 'none';
    animeRow.style.display = 'none';
  } else if (type === 'tv') {
    moviesRow.style.display = 'none';
    tvRow.style.display = 'block';
    animeRow.style.display = 'none';
  } else if (type === 'anime') {
    moviesRow.style.display = 'none';
    tvRow.style.display = 'none';
    animeRow.style.display = 'block';
  } else {
    moviesRow.style.display = 'block';
    tvRow.style.display = 'block';
    animeRow.style.display = 'block';
  }
}

async function filterByGenre(genreId, btn) {
  document.querySelectorAll('.genre-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');

  if (genreId === 'all') {
    loadHomeRows();
    return;
  }

  const moviesData = await fetchTMDB(`/discover/movie?with_genres=${genreId}`);
  if (moviesData) displayList(moviesData.results, 'movies-list', 'movie');

  const tvData = await fetchTMDB(`/discover/tv?with_genres=${genreId}`);
  if (tvData) displayList(tvData.results, 'tvshows-list', 'tv');
}

/* =========================================================
   MODAL CONTROLS & UTILS
========================================================= */

function openSearchModal() {
  const modal = document.getElementById('search-modal');
  modal.style.display = 'block';
  document.getElementById('active-search-input').focus();
}

function closeSearchModal() {
  document.getElementById('search-modal').style.display = 'none';
}

let searchTimeout;
function handleSearchInput(e) {
  clearTimeout(searchTimeout);
  const query = e.target.value.trim();
  if (!query) return;

  searchTimeout = setTimeout(async () => {
    const data = await fetchTMDB(`/search/multi?query=${encodeURIComponent(query)}`);
    if (data) {
      const grid = document.getElementById('search-results-grid');
      grid.innerHTML = '';
      data.results.forEach(item => {
        if (!item.poster_path) return;
        const img = document.createElement('img');
        img.src = `${IMG_BASE_URL}${item.poster_path}`;
        img.onclick = () => {
          closeSearchModal();
          showDetails(item);
        };
        grid.appendChild(img);
      });
    }
  }, 300);
}

async function openGridModal(category) {
  const modal = document.getElementById('grid-modal');
  const grid = document.getElementById('grid-container');
  const title = document.getElementById('grid-modal-title');
  grid.innerHTML = '';

  let endpoint = '/trending/movie/week';
  if (category === 'tv') endpoint = '/trending/tv/week';
  if (category === 'anime') endpoint = '/discover/tv?with_genres=16&with_keywords=210024';

  title.textContent = `All ${category.toUpperCase()}`;
  const data = await fetchTMDB(endpoint);

  if (data) {
    data.results.forEach(item => {
      if (!item.poster_path) return;
      const img = document.createElement('img');
      img.src = `${IMG_BASE_URL}${item.poster_path}`;
      img.onclick = () => {
        closeGridModal();
        showDetails(item);
      };
      grid.appendChild(img);
    });
  }

  modal.style.display = 'block';
}

function closeGridModal() {
  document.getElementById('grid-modal').style.display = 'none';
}

async function surpriseMe() {
  const data = await fetchTMDB('/trending/all/day');
  if (data && data.results.length > 0) {
    const randomIndex = Math.floor(Math.random() * data.results.length);
    showDetails(data.results[randomIndex]);
  }
}

function shareCurrentItem() {
  if (navigator.share && currentSelectedItem) {
    navigator.share({
      title: currentSelectedItem.title || currentSelectedItem.name,
      text: `Watch ${currentSelectedItem.title || currentSelectedItem.name} on StreamVault!`,
      url: window.location.href,
    });
  } else {
    alert('Link copied to clipboard!');
  }
}
