const API_KEY = '3fd2be6f0c70a2a598f084dd27548780';
const BASE_URL = 'https://api.themoviedb.org/3';
const IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/original';
const POSTER_BASE_URL = 'https://image.tmdb.org/t/p/w500';

const DOM = {
  navLogo: document.getElementById('navLogo'),
  navLinks: document.querySelectorAll('.nav-item'),
  searchInput: document.getElementById('searchInput'),
  clearSearch: document.getElementById('clearSearch'),
  heroBanner: document.getElementById('heroBanner'),
  heroBackdrop: document.getElementById('heroBackdrop'),
  heroBadge: document.getElementById('heroBadge'),
  heroTitle: document.getElementById('heroTitle'),
  heroRating: document.getElementById('heroRating'),
  heroYear: document.getElementById('heroYear'),
  heroType: document.getElementById('heroType'),
  heroOverview: document.getElementById('heroOverview'),
  heroPlayBtn: document.getElementById('heroPlayBtn'),
  heroInfoBtn: document.getElementById('heroInfoBtn'),
  tabContent: document.getElementById('tabContent'),
  trendingRow: document.getElementById('trendingRow'),
  popularMoviesRow: document.getElementById('popularMoviesRow'),
  popularTvRow: document.getElementById('popularTvRow'),
  topRatedRow: document.getElementById('topRatedRow'),
  categoryGridView: document.getElementById('categoryGridView'),
  gridTitle: document.getElementById('gridTitle'),
  genreSelect: document.getElementById('genreSelect'),
  mediaGrid: document.getElementById('mediaGrid'),
  gridLoader: document.getElementById('gridLoader'),
  detailsModal: document.getElementById('detailsModal'),
  modalClose: document.getElementById('modalClose'),
  modalVideo: document.getElementById('modalVideo'),
  modalTitle: document.getElementById('modalTitle'),
  modalRating: document.getElementById('modalRating'),
  modalYear: document.getElementById('modalYear'),
  modalType: document.getElementById('modalType'),
  modalOverview: document.getElementById('modalOverview'),
  tvControls: document.getElementById('tvControls'),
  seasonSelect: document.getElementById('seasonSelect'),
  episodeSelect: document.getElementById('episodeSelect')
};

const state = {
  currentItem: null,
  bannerItem: null,
  currentSeason: 1,
  currentEpisode: 1,
  maxEpisodesInSeason: 0,
  currentTabCategory: 'all',
  currentServer: 'vidlink', // Priority 1: VidLink
  gridCategory: null,
  gridPage: 1,
  gridLoading: false,
  gridHasMore: true,
  gridSelectedGenre: 'all',
  openedFromGrid: false
};

const GENRES = {
  movie: [
    { id: 28, name: 'Action' },
    { id: 12, name: 'Adventure' },
    { id: 16, name: 'Animation' },
    { id: 35, name: 'Comedy' },
    { id: 80, name: 'Crime' },
    { id: 99, name: 'Documentary' },
    { id: 18, name: 'Drama' },
    { id: 10751, name: 'Family' },
    { id: 14, name: 'Fantasy' },
    { id: 36, name: 'History' },
    { id: 27, name: 'Horror' },
    { id: 10402, name: 'Music' },
    { id: 9648, name: 'Mystery' },
    { id: 10749, name: 'Romance' },
    { id: 878, name: 'Science Fiction' },
    { id: 53, name: 'Thriller' }
  ],
  tv: [
    { id: 10759, name: 'Action & Adventure' },
    { id: 16, name: 'Animation' },
    { id: 35, name: 'Comedy' },
    { id: 80, name: 'Crime' },
    { id: 99, name: 'Documentary' },
    { id: 18, name: 'Drama' },
    { id: 10751, name: 'Family' },
    { id: 10762, name: 'Kids' },
    { id: 9648, name: 'Mystery' },
    { id: 10763, name: 'News' },
    { id: 10764, name: 'Reality' },
    { id: 10765, name: 'Sci-Fi & Fantasy' },
    { id: 10768, name: 'War & Politics' }
  ]
};

document.addEventListener('DOMContentLoaded', () => {
  initApp();
  setupEventListeners();
});

async function initApp() {
  await fetchBannerContent();
  await loadHomeRows();
}

function setupEventListeners() {
  DOM.navLogo.addEventListener('click', () => switchTab('all'));

  DOM.navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const tab = link.getAttribute('data-tab');
      switchTab(tab);
    });
  });

  let searchTimeout;
  DOM.searchInput.addEventListener('input', (e) => {
    const query = e.target.value.trim();
    if (query.length > 0) {
      DOM.clearSearch.classList.remove('hidden');
    } else {
      DOM.clearSearch.classList.add('hidden');
    }

    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      if (query.length >= 2) {
        startSearch(query);
      } else if (query.length === 0) {
        switchTab(state.currentTabCategory);
      }
    }, 400);
  });

  DOM.clearSearch.addEventListener('click', () => {
    DOM.searchInput.value = '';
    DOM.clearSearch.classList.add('hidden');
    switchTab(state.currentTabCategory);
  });

  DOM.heroPlayBtn.addEventListener('click', () => {
    if (state.bannerItem) openModal(state.bannerItem);
  });

  DOM.heroInfoBtn.addEventListener('click', () => {
    if (state.bannerItem) openModal(state.bannerItem);
  });

  DOM.modalClose.addEventListener('click', closeModal);
  DOM.detailsModal.addEventListener('click', (e) => {
    if (e.target === DOM.detailsModal) closeModal();
  });

  DOM.seasonSelect.addEventListener('change', async (e) => {
    state.currentSeason = parseInt(e.target.value, 10);
    state.currentEpisode = 1;
    await populateEpisodeSelect(state.currentItem.id, state.currentSeason);
    loadVideo();
  });

  DOM.episodeSelect.addEventListener('change', (e) => {
    state.currentEpisode = parseInt(e.target.value, 10);
    loadVideo();
  });

  DOM.genreSelect.addEventListener('change', (e) => {
    state.gridSelectedGenre = e.target.value;
    state.gridPage = 1;
    DOM.mediaGrid.innerHTML = '';
    loadGridItems();
  });

  window.addEventListener('scroll', handleInfiniteScroll);
}

function switchTab(tab) {
  state.currentTabCategory = tab;
  DOM.navLinks.forEach(l => l.classList.remove('active'));
  
  const activeLink = Array.from(DOM.navLinks).find(l => l.getAttribute('data-tab') === tab);
  if (activeLink) activeLink.classList.add('active');

  DOM.searchInput.value = '';
  DOM.clearSearch.classList.add('hidden');

  if (tab === 'all') {
    DOM.heroBanner.classList.remove('hidden');
    DOM.tabContent.classList.remove('hidden');
    DOM.categoryGridView.classList.add('hidden');
  } else {
    DOM.heroBanner.classList.add('hidden');
    DOM.tabContent.classList.add('hidden');
    DOM.categoryGridView.classList.remove('hidden');

    state.gridCategory = tab;
    state.gridPage = 1;
    state.gridSelectedGenre = 'all';
    DOM.gridTitle.textContent = tab === 'movie' ? 'Movies' : 'TV Shows';
    
    populateGenreDropdown(tab);
    DOM.mediaGrid.innerHTML = '';
    loadGridItems();
  }
}

async function fetchBannerContent() {
  try {
    const res = await fetch(`${BASE_URL}/trending/all/week?api_key=${API_KEY}`);
    const data = await res.json();
    const items = data.results.filter(item => item.backdrop_path && (item.title || item.name));
    
    if (items.length > 0) {
      state.bannerItem = items[Math.floor(Math.random() * items.length)];
      renderBanner(state.bannerItem);
    }
  } catch (err) {
    console.error('Failed to fetch banner:', err);
  }
}

function renderBanner(item) {
  DOM.heroBackdrop.style.backgroundImage = `url(${IMAGE_BASE_URL}${item.backdrop_path})`;
  DOM.heroTitle.textContent = item.title || item.name || 'Untitled';
  
  const rating = item.vote_average ? item.vote_average.toFixed(1) : 'N/A';
  DOM.heroRating.innerHTML = `<i class="fa-solid fa-star"></i> ${rating}`;
  
  const dateStr = item.release_date || item.first_air_date || '';
  DOM.heroYear.textContent = dateStr ? dateStr.split('-')[0] : 'N/A';
  
  const type = item.media_type === 'tv' || !item.title ? 'TV Show' : 'Movie';
  DOM.heroType.textContent = type;
  DOM.heroOverview.textContent = item.overview || 'No overview available.';
}

async function loadHomeRows() {
  const trending = await fetchAPI('/trending/all/day');
  const popMovies = await fetchAPI('/movie/popular');
  const popTv = await fetchAPI('/tv/popular');
  const topRated = await fetchAPI('/top_rated', 'movie');

  renderCarousel(DOM.trendingRow, trending);
  renderCarousel(DOM.popularMoviesRow, popMovies);
  renderCarousel(DOM.popularTvRow, popTv);
  renderCarousel(DOM.topRatedRow, topRated);
}

function renderCarousel(container, items) {
  if (!container) return;
  container.innerHTML = '';

  items.forEach(item => {
    if (!item.poster_path) return;
    const card = createMediaCard(item);
    container.appendChild(card);
  });
}

function createMediaCard(item) {
  const card = document.createElement('div');
  card.className = 'media-card';

  const title = item.title || item.name || 'Untitled';
  const rating = item.vote_average ? item.vote_average.toFixed(1) : 'N/A';
  const posterSrc = item.poster_path ? `${POSTER_BASE_URL}${item.poster_path}` : '';

  card.innerHTML = `
    <img src="${posterSrc}" alt="${title}" loading="lazy" />
    <div class="card-info">
      <h3 class="card-title">${title}</h3>
      <span class="card-rating"><i class="fa-solid fa-star"></i> ${rating}</span>
    </div>
  `;

  card.addEventListener('click', () => openModal(item));
  return card;
}

function populateGenreDropdown(category) {
  DOM.genreSelect.innerHTML = '<option value="all">All Genres</option>';
  const list = GENRES[category] || [];
  list.forEach(g => {
    const opt = document.createElement('option');
    opt.value = g.id;
    opt.textContent = g.name;
    DOM.genreSelect.appendChild(opt);
  });
}

async function loadGridItems() {
  if (state.gridLoading) return;
  state.gridLoading = true;
  DOM.gridLoader.classList.remove('hidden');

  let endpoint = `/${state.gridCategory}/popular?page=${state.gridPage}`;
  if (state.gridSelectedGenre !== 'all') {
    endpoint = `/discover/${state.gridCategory}?with_genres=${state.gridSelectedGenre}&page=${state.gridPage}`;
  }

  const items = await fetchAPI(endpoint);
  
  if (!items || items.length === 0) {
    state.gridHasMore = false;
  } else {
    items.forEach(item => {
      if (item.poster_path) {
        if (!item.media_type) item.media_type = state.gridCategory;
        DOM.mediaGrid.appendChild(createMediaCard(item));
      }
    });
    state.gridPage++;
  }

  state.gridLoading = false;
  DOM.gridLoader.classList.add('hidden');
}

function startSearch(query) {
  DOM.heroBanner.classList.add('hidden');
  DOM.tabContent.classList.add('hidden');
  DOM.categoryGridView.classList.remove('hidden');
  
  DOM.gridTitle.textContent = `Search Results for "${query}"`;
  DOM.gridFilters.style.display = 'none';
  DOM.mediaGrid.innerHTML = '';
  
  state.gridCategory = 'search';
  state.gridPage = 1;
  executeSearch(query);
}

async function executeSearch(query) {
  if (state.gridLoading) return;
  state.gridLoading = true;
  DOM.gridLoader.classList.remove('hidden');

  try {
    const res = await fetch(`${BASE_URL}/search/multi?api_key=${API_KEY}&query=${encodeURIComponent(query)}&page=${state.gridPage}`);
    const data = await res.json();
    const items = data.results || [];

    if (items.length === 0 && state.gridPage === 1) {
      DOM.mediaGrid.innerHTML = '<p class="no-results">No media found matching your query.</p>';
    } else {
      items.forEach(item => {
        if ((item.media_type === 'movie' || item.media_type === 'tv') && item.poster_path) {
          DOM.mediaGrid.appendChild(createMediaCard(item));
        }
      });
    }
  } catch (err) {
    console.error('Search error:', err);
  }

  state.gridLoading = false;
  DOM.gridLoader.classList.add('hidden');
}

function handleInfiniteScroll() {
  if (DOM.categoryGridView.classList.contains('hidden') || state.gridLoading) return;

  const scrollPosition = window.innerHeight + window.scrollY;
  const threshold = document.documentElement.offsetHeight - 500;

  if (scrollPosition >= threshold) {
    if (state.gridCategory === 'search') {
      const query = DOM.searchInput.value.trim();
      if (query.length >= 2) {
        state.gridPage++;
        executeSearch(query);
      }
    } else if (state.gridHasMore) {
      loadGridItems();
    }
  }
}

async function openModal(item) {
  state.currentItem = item;
  state.currentSeason = 1;
  state.currentEpisode = 1;

  const isTv = item.media_type === 'tv' || !item.title;

  DOM.modalTitle.textContent = item.title || item.name || 'Untitled';
  const rating = item.vote_average ? item.vote_average.toFixed(1) : 'N/A';
  DOM.modalRating.innerHTML = `<i class="fa-solid fa-star"></i> ${rating}`;
  
  const dateStr = item.release_date || item.first_air_date || '';
  DOM.modalYear.textContent = dateStr ? dateStr.split('-')[0] : 'N/A';
  DOM.modalType.textContent = isTv ? 'TV Show' : 'Movie';
  DOM.modalOverview.textContent = item.overview || 'No overview available.';

  if (isTv) {
    DOM.tvControls.classList.remove('hidden');
    await setupTvSelectors(item.id);
  } else {
    DOM.tvControls.classList.add('hidden');
  }

  // Set default active server button to VidLink
  switchServer('vidlink');

  DOM.detailsModal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  DOM.detailsModal.classList.add('hidden');
  DOM.modalVideo.src = '';
  document.body.style.overflow = 'auto';
}

function switchServer(serverName) {
  state.currentServer = serverName;

  const btns = document.querySelectorAll('.server-btn');
  btns.forEach(btn => {
    if (btn.getAttribute('data-server') === serverName) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  loadVideo();
}

function loadVideo() {
  if (!state.currentItem || !DOM.modalVideo) return;
  const isTv = state.currentItem.media_type === 'tv' || !state.currentItem.title;
  let embedURL = '';

  if (state.currentServer === 'vidlink') {
    // 1st Server Priority: VidLink
    embedURL = isTv 
      ? `https://vidlink.pro/tv/${state.currentItem.id}/${state.currentSeason}/${state.currentEpisode}?primaryColor=e50914&autoplay=false`
      : `https://vidlink.pro/movie/${state.currentItem.id}?primaryColor=e50914&autoplay=false`;
  } else if (state.currentServer === 'vidcore') {
    // 2nd Server Priority: VidCore
    embedURL = isTv 
      ? `https://vidcore.net/embed/tv/${state.currentItem.id}/${state.currentSeason}/${state.currentEpisode}`
      : `https://vidcore.net/embed/movie/${state.currentItem.id}`;
  } else if (state.currentServer === 'videasy') {
    // 3rd Server Priority: VideEasy
    embedURL = isTv 
      ? `https://player.videasy.net/tv/${state.currentItem.id}/${state.currentSeason}/${state.currentEpisode}`
      : `https://player.videasy.net/movie/${state.currentItem.id}`;
  }

  if (DOM.modalVideo.src !== embedURL) DOM.modalVideo.src = embedURL;
}

async function setupTvSelectors(tvId) {
  DOM.seasonSelect.innerHTML = '';
  DOM.episodeSelect.innerHTML = '';

  try {
    const res = await fetch(`${BASE_URL}/tv/${tvId}?api_key=${API_KEY}`);
    const details = await res.json();
    const seasons = details.seasons ? details.seasons.filter(s => s.season_number > 0) : [];

    if (seasons.length === 0) {
      const opt = document.createElement('option');
      opt.value = 1;
      opt.textContent = 'Season 1';
      DOM.seasonSelect.appendChild(opt);
    } else {
      seasons.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.season_number;
        opt.textContent = `Season ${s.season_number}`;
        DOM.seasonSelect.appendChild(opt);
      });
    }

    state.currentSeason = seasons.length > 0 ? seasons[0].season_number : 1;
    await populateEpisodeSelect(tvId, state.currentSeason);

  } catch (err) {
    console.error('Error fetching TV details:', err);
  }
}

async function populateEpisodeSelect(tvId, seasonNumber) {
  DOM.episodeSelect.innerHTML = '';
  try {
    const res = await fetch(`${BASE_URL}/tv/${tvId}/season/${seasonNumber}?api_key=${API_KEY}`);
    const seasonData = await res.json();
    const episodes = seasonData.episodes || [];

    if (episodes.length === 0) {
      const opt = document.createElement('option');
      opt.value = 1;
      opt.textContent = 'Episode 1';
      DOM.episodeSelect.appendChild(opt);
    } else {
      episodes.forEach(e => {
        const opt = document.createElement('option');
        opt.value = e.episode_number;
        opt.textContent = `Episode ${e.episode_number}: ${e.name || ''}`;
        DOM.episodeSelect.appendChild(opt);
      });
    }
  } catch (err) {
    console.error('Error fetching season details:', err);
  }
}

async function fetchAPI(endpoint, type = null) {
  try {
    const prefix = endpoint.startsWith('/') ? '' : '/';
    const hasParams = endpoint.includes('?');
    const url = `${BASE_URL}${prefix}${endpoint}${hasParams ? '&' : '?'}api_key=${API_KEY}`;
    
    const res = await fetch(url);
    const data = await res.json();

    if (data.results) {
      if (type) {
        data.results.forEach(i => i.media_type = type);
      }
      return data.results;
    }
    return [];
  } catch (err) {
    console.error(`API Fetch Error [${endpoint}]:`, err);
    return [];
  }
}
