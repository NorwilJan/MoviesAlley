/* =========================================================
   STREAMVAULT CORE ENGINE v2.0
   Included: Instant Search, Dynamic Recommendations,
   Multi-Server Player, LocalStorage Watchlist, Cinematic UI
========================================================= */

const APP_CONFIG = Object.freeze({
  API_KEY: 'c5f2e226dd2ee0c8ed2c272a0ebaf049', // Replace with your TMDB key if needed
  BASE_URL: 'https://api.themoviedb.org/3',
  POSTER_URL: 'https://image.tmdb.org/t/p/w342',
  BACKDROP_URL: 'https://image.tmdb.org/t/p/original',
  SERVERS: {
    videasy: 'https://player.videasy.net/movie/',
    vidsrc: 'https://vidsrc.xyz/embed/movie?tmdb=',
    vidsrcpro: 'https://vidsrc.pro/embed/movie/'
  }
});

const appState = {
  activeMovie: null,
  activeServer: 'videasy',
  watchlist: JSON.parse(localStorage.getItem('sv_watchlist') || '[]'),
  searchTimeout: null
};

/* =========================================================
   1. API CORE ENGINE
========================================================= */

async function apiFetch(endpoint, params = {}) {
  try {
    const url = new URL(`${APP_CONFIG.BASE_URL}${endpoint}`);
    url.searchParams.set('api_key', APP_CONFIG.API_KEY);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    
    const res = await fetch(url.toString());
    return res.ok ? await res.json() : null;
  } catch (err) {
    console.error('API Error:', err);
    return null;
  }
}

// Fetches clean feed without variety/talk show clutter
async function fetchCleanMovies(genreId = null) {
  const params = {
    sort_by: 'popularity.desc',
    without_genres: '10764,10767,10763,99,16', // Excludes Reality, Talk, News, Doc, Anime
    page: 1
  };
  if (genreId && genreId !== 'all') params.with_genres = genreId;
  
  const data = await apiFetch('/discover/movie', params);
  return data?.results || [];
}

/* =========================================================
   2. UI GENERATORS & SKELETON LOADERS
========================================================= */

function renderSkeletons(container, count = 6) {
  container.innerHTML = Array(count).fill(`
    <div class="skeleton-card" style="background:#1a1a1a; aspect-ratio:2/3; border-radius:8px; animation: pulse 1.5s infinite ease-in-out;"></div>
  `).join('');
}

function createMovieCard(movie) {
  const isSaved = appState.watchlist.some(item => item.id === movie.id);
  const card = document.createElement('div');
  card.className = 'movie-card';
  card.style.cssText = 'position:relative; cursor:pointer; transition:transform 0.2s;';
  
  card.innerHTML = `
    <img src="${movie.poster_path ? APP_CONFIG.POSTER_URL + movie.poster_path : 'https://via.placeholder.com/342x513'}" 
         alt="${movie.title}" 
         loading="lazy" 
         style="width:100%; border-radius:8px; display:block;">
    <button class="bookmark-btn" data-id="${movie.id}" style="position:absolute; top:8px; right:8px; background:rgba(0,0,0,0.7); border:none; color:${isSaved ? '#e50914' : '#fff'}; padding:6px 10px; border-radius:50%; cursor:pointer;">
      ${isSaved ? '♥' : '♡'}
    </button>
    <div class="movie-info" style="padding:8px 0;">
      <h4 style="margin:0; font-size:0.9rem; color:#fff; text-overflow:ellipsis; overflow:hidden; white-space:nowrap;">${movie.title}</h4>
      <span style="font-size:0.8rem; color:#888;">★ ${movie.vote_average ? movie.vote_average.toFixed(1) : 'N/A'}</span>
    </div>
  `;

  // Open player modal on card click
  card.addEventListener('click', (e) => {
    if (e.target.classList.contains('bookmark-btn')) {
      e.stopPropagation();
      toggleWatchlist(movie, e.target);
      return;
    }
    openPlaybackModal(movie);
  });

  return card;
}

/* =========================================================
   3. MULTI-SERVER PLAYER & RECOMMENDATIONS MODAL
========================================================= */

async function openPlaybackModal(movie) {
  appState.activeMovie = movie;
  
  // Set Hero Backdrop & Title
  const modal = document.getElementById('player-modal');
  const title = document.getElementById('modal-title');
  const overview = document.getElementById('modal-overview');
  
  if (title) title.textContent = movie.title;
  if (overview) overview.textContent = movie.overview || 'No description available.';
  
  // Load Default Server
  switchServer(appState.activeServer);
  
  // Display Modal
  modal.style.display = 'flex';
  
  // Fetch Dynamic "Watch Next" Recommendations
  loadRecommendations(movie.id);
}

function switchServer(serverKey) {
  appState.activeServer = serverKey;
  const iframe = document.getElementById('video-player');
  if (!iframe || !appState.activeMovie) return;

  const baseUrl = APP_CONFIG.SERVERS[serverKey];
  iframe.src = `${baseUrl}${appState.activeMovie.id}`;
  
  // Highlight active button UI
  document.querySelectorAll('.server-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.server === serverKey);
  });
}

async function loadRecommendations(movieId) {
  const container = document.getElementById('recommendations-grid');
  if (!container) return;
  
  renderSkeletons(container, 4);
  const data = await apiFetch(`/movie/${movieId}/recommendations`);
  container.innerHTML = '';

  if (data?.results?.length) {
    data.results.slice(0, 6).forEach(movie => {
      container.appendChild(createMovieCard(movie));
    });
  } else {
    container.innerHTML = '<p style="color:#666;">No similar movies found.</p>';
  }
}

/* =========================================================
   4. LOCALSTORAGE WATCHLIST SYSTEM
========================================================= */

function toggleWatchlist(movie, buttonEl) {
  const index = appState.watchlist.findIndex(item => item.id === movie.id);
  
  if (index > -1) {
    appState.watchlist.splice(index, 1);
    if (buttonEl) { buttonEl.innerHTML = '♡'; buttonEl.style.color = '#fff'; }
  } else {
    appState.watchlist.push(movie);
    if (buttonEl) { buttonEl.innerHTML = '♥'; buttonEl.style.color = '#e50914'; }
  }

  localStorage.setItem('sv_watchlist', JSON.stringify(appState.watchlist));
  renderWatchlistSection();
}

function renderWatchlistSection() {
  const container = document.getElementById('watchlist-grid');
  const section = document.getElementById('watchlist-section');
  if (!container || !section) return;

  container.innerHTML = '';
  if (appState.watchlist.length === 0) {
    section.style.display = 'none';
    return;
  }

  section.style.display = 'block';
  appState.watchlist.forEach(movie => {
    container.appendChild(createMovieCard(movie));
  });
}

/* =========================================================
   5. LIVE SEARCH WITH DEBOUNCE
========================================================= */

function initLiveSearch() {
  const searchInput = document.getElementById('search-input');
  const searchResults = document.getElementById('search-results-grid');
  if (!searchInput || !searchResults) return;

  searchInput.addEventListener('input', (e) => {
    clearTimeout(appState.searchTimeout);
    const query = e.target.value.trim();

    if (!query) {
      searchResults.innerHTML = '';
      return;
    }

    // 300ms Debounce to optimize network overhead
    appState.searchTimeout = setTimeout(async () => {
      renderSkeletons(searchResults, 6);
      const data = await apiFetch('/search/movie', { query });
      searchResults.innerHTML = '';

      if (data?.results?.length) {
        data.results.forEach(movie => {
          if (movie.poster_path) searchResults.appendChild(createMovieCard(movie));
        });
      } else {
        searchResults.innerHTML = '<p style="color:#888; grid-column: 1/-1;">No movies found.</p>';
      }
    }, 300);
  });
}

/* =========================================================
   INITIALIZATION
========================================================= */

async function initApp() {
  initLiveSearch();
  renderWatchlistSection();

  const mainGrid = document.getElementById('main-movie-grid');
  if (mainGrid) {
    renderSkeletons(mainGrid, 12);
    const movies = await fetchCleanMovies();
    mainGrid.innerHTML = '';
    movies.forEach(movie => mainGrid.appendChild(createMovieCard(movie)));
  }
}

document.addEventListener('DOMContentLoaded', initApp);
