const TMDB_API_KEY = 'YOUR_TMDB_API_KEY'; // Insert your TMDB API key here
const BASE_URL = 'https://api.themoviedb.org/3';

// Active working server providers
const SERVERS = [
    {
        id: 'embedsu',
        name: 'Server 1 (Embed.su)',
        getMovieUrl: (tmdbId) => `https://embed.su/embed/movie/${tmdbId}`,
        getTvUrl: (tmdbId, season, episode) => `https://embed.su/embed/tv/${tmdbId}/${season}/${episode}`
    },
    {
        id: 'vidlink',
        name: 'Server 2 (VidLink)',
        getMovieUrl: (tmdbId) => `https://vidlink.pro/movie/${tmdbId}`,
        getTvUrl: (tmdbId, season, episode) => `https://vidlink.pro/tv/${tmdbId}/${season}/${episode}`
    },
    {
        id: 'vidsrcvip',
        name: 'Server 3 (VidSrc VIP)',
        getMovieUrl: (tmdbId) => `https://vidsrc.vip/embed/movie/${tmdbId}`,
        getTvUrl: (tmdbId, season, episode) => `https://vidsrc.vip/embed/tv/${tmdbId}/${season}/${episode}`
    },
    {
        id: 'vidsrccc',
        name: 'Server 4 (VidSrc CC)',
        getMovieUrl: (tmdbId) => `https://vidsrc.cc/v2/embed/movie/${tmdbId}`,
        getTvUrl: (tmdbId, season, episode) => `https://vidsrc.cc/v2/embed/tv/${tmdbId}/${season}/${episode}`
    },
    {
        id: 'autoembed',
        name: 'Server 5 (AutoEmbed)',
        getMovieUrl: (tmdbId) => `https://player.autoembed.cc/embed/movie/${tmdbId}`,
        getTvUrl: (tmdbId, season, episode) => `https://player.autoembed.cc/embed/tv/${tmdbId}/${season}/${episode}`
    }
];

// App State
let currentTab = 'all'; // 'all', 'movie', 'tv', 'watchlist'
let currentGenre = 'all';
let currentPage = 1;
let isLoading = false;
let currentMedia = null;
let currentServerIndex = 0;
let searchDebounceTimeout = null;

// Elements
const mediaGrid = document.getElementById('media-grid');
const searchResultsGrid = document.getElementById('search-results-grid');
const genreBar = document.getElementById('genre-bar');
const sectionTitle = document.getElementById('section-title');
const loadingSpinner = document.getElementById('loading-spinner');

const searchModal = document.getElementById('search-modal');
const playerModal = document.getElementById('player-modal');
const openSearchBtn = document.getElementById('open-search-btn');
const closeSearchBtn = document.getElementById('close-search-btn');
const closePlayerBtn = document.getElementById('close-player-btn');
const searchInput = document.getElementById('search-input');
const recentSearchesContainer = document.getElementById('recent-searches-container');
const recentTagsList = document.getElementById('recent-tags-list');
const clearHistoryBtn = document.getElementById('clear-history-btn');

const playerIframe = document.getElementById('player-iframe');
const playerTitle = document.getElementById('player-title');
const playerOverview = document.getElementById('player-overview');
const playerRating = document.getElementById('player-rating');
const playerYear = document.getElementById('player-year');
const playerType = document.getElementById('player-type');
const serverSelectorContainer = document.getElementById('server-selector-container');
const tvControls = document.getElementById('tv-controls');
const seasonSelect = document.getElementById('season-select');
const episodeSelect = document.getElementById('episode-select');
const watchlistToggleBtn = document.getElementById('watchlist-toggle-btn');

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    initGenreBar();
    fetchMediaData(true);
    setupEventListeners();
});

function setupEventListeners() {
    // Navigation Tabs
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            currentTab = e.target.dataset.type;
            currentGenre = 'all';
            updateGenreBarActive();
            fetchMediaData(true);
        });
    });

    // Search Modal Controls
    openSearchBtn.addEventListener('click', () => {
        searchModal.classList.remove('hidden');
        searchInput.focus();
        renderRecentSearches();
    });

    closeSearchBtn.addEventListener('click', () => searchModal.classList.add('hidden'));

    closePlayerBtn.addEventListener('click', () => {
        playerModal.classList.add('hidden');
        playerIframe.src = ''; // Terminate playback
    });

    searchInput.addEventListener('input', (e) => {
        clearTimeout(searchDebounceTimeout);
        const query = e.target.value.trim();
        if (!query) {
            searchResultsGrid.innerHTML = '';
            renderRecentSearches();
            return;
        }
        searchDebounceTimeout = setTimeout(() => executeSearch(query), 300);
    });

    clearHistoryBtn.addEventListener('click', () => {
        localStorage.removeItem('searchHistory');
        renderRecentSearches();
    });

    // Watchlist Toggle
    watchlistToggleBtn.addEventListener('click', toggleWatchlist);

    // Infinite Scroll
    window.addEventListener('scroll', () => {
        if (currentTab === 'watchlist') return;
        if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight - 500) {
            if (!isLoading) {
                currentPage++;
                fetchMediaData(false);
            }
        }
    });

    // TV Season/Episode Selectors
    seasonSelect.addEventListener('change', () => {
        currentMedia.season = parseInt(seasonSelect.value);
        currentMedia.episode = 1;
        populateEpisodes(currentMedia.seasonDetails[currentMedia.season - 1].episode_count);
        loadPlayerStream();
    });

    episodeSelect.addEventListener('change', () => {
        currentMedia.episode = parseInt(episodeSelect.value);
        loadPlayerStream();
    });
}

// Fetch Main Grid Data
async function fetchMediaData(reset = false) {
    if (reset) {
        currentPage = 1;
        mediaGrid.innerHTML = '';
    }

    if (currentTab === 'watchlist') {
        renderWatchlist();
        return;
    }

    isLoading = true;
    loadingSpinner.classList.remove('hidden');

    let endpoint = `${BASE_URL}/trending/all/day?api_key=${TMDB_API_KEY}&page=${currentPage}`;
    if (currentTab === 'movie') endpoint = `${BASE_URL}/discover/movie?api_key=${TMDB_API_KEY}&page=${currentPage}`;
    if (currentTab === 'tv') endpoint = `${BASE_URL}/discover/tv?api_key=${TMDB_API_KEY}&page=${currentPage}`;

    if (currentGenre !== 'all') {
        endpoint += `&with_genres=${currentGenre}`;
    }

    try {
        const res = await fetch(endpoint);
        const data = await res.json();
        renderCards(data.results || [], mediaGrid, !reset);
    } catch (err) {
        console.error('Data fetch error:', err);
    } finally {
        isLoading = false;
        loadingSpinner.classList.add('hidden');
    }
}

// Genre Filtering
async function initGenreBar() {
    try {
        const [movieRes, tvRes] = await Promise.all([
            fetch(`${BASE_URL}/genre/movie/list?api_key=${TMDB_API_KEY}`).then(r => r.json()),
            fetch(`${BASE_URL}/genre/tv/list?api_key=${TMDB_API_KEY}`).then(r => r.json())
        ]);

        const genres = Array.from(
            new Map([...movieRes.genres, ...tvRes.genres].map(g => [g.id, g])).values()
        );

        genreBar.innerHTML = `<button class="genre-chip active" data-genre="all">All Genres</button>` +
            genres.map(g => `<button class="genre-chip" data-genre="${g.id}">${g.name}</button>`).join('');

        genreBar.querySelectorAll('.genre-chip').forEach(chip => {
            chip.addEventListener('click', (e) => {
                genreBar.querySelectorAll('.genre-chip').forEach(c => c.classList.remove('active'));
                e.target.classList.add('active');
                currentGenre = e.target.dataset.genre;
                fetchMediaData(true);
            });
        });
    } catch (err) {
        console.error('Failed loading genres:', err);
    }
}

function updateGenreBarActive() {
    genreBar.querySelectorAll('.genre-chip').forEach(c => {
        c.classList.toggle('active', c.dataset.genre === currentGenre);
    });
}

// Search History Implementation
function getSearchHistory() {
    return JSON.parse(localStorage.getItem('searchHistory')) || [];
}

function saveSearchQuery(query) {
    let history = getSearchHistory().filter(q => q.toLowerCase() !== query.toLowerCase());
    history.unshift(query);
    if (history.length > 5) history.pop();
    localStorage.setItem('searchHistory', JSON.stringify(history));
}

function renderRecentSearches() {
    const history = getSearchHistory();
    if (history.length === 0) {
        recentSearchesContainer.classList.add('hidden');
        return;
    }
    recentSearchesContainer.classList.remove('hidden');
    recentTagsList.innerHTML = history.map(query => `
        <span class="history-tag" onclick="triggerSearchTag('${query}')">
            ${query}
            <i class="fas fa-times remove-tag" onclick="removeSearchTag('${query}', event)"></i>
        </span>
    `).join('');
}

function triggerSearchTag(query) {
    searchInput.value = query;
    executeSearch(query);
}

function removeSearchTag(query, e) {
    e.stopPropagation();
    let history = getSearchHistory().filter(q => q.toLowerCase() !== query.toLowerCase());
    localStorage.setItem('searchHistory', JSON.stringify(history));
    renderRecentSearches();
}

async function executeSearch(query) {
    saveSearchQuery(query);
    renderRecentSearches();

    try {
        const res = await fetch(`${BASE_URL}/search/multi?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}`);
        const data = await res.json();
        renderCards(data.results || [], searchResultsGrid, false);
    } catch (err) {
        console.error('Search request failed:', err);
    }
}

// Render Media Cards Grid
function renderCards(items, container, append = false) {
    if (!append) container.innerHTML = '';

    const validItems = items.filter(i => i.poster_path && (i.media_type === 'movie' || i.media_type === 'tv' || currentTab !== 'all'));

    const html = validItems.map(item => {
        const title = item.title || item.name;
        const type = item.media_type || (item.first_air_date ? 'tv' : 'movie');
        const year = (item.release_date || item.first_air_date || 'N/A').split('-')[0];
        const rating = item.vote_average ? item.vote_average.toFixed(1) : 'N/A';

        return `
            <div class="media-card" onclick="openMediaModal(${item.id}, '${type}')">
                <div class="poster-wrapper">
                    <img src="https://image.tmdb.org/t/p/w300${item.poster_path}" alt="${title}" loading="lazy">
                    <div class="card-rating"><i class="fas fa-star"></i> ${rating}</div>
                </div>
                <div class="card-info">
                    <div class="media-card-title">${title}</div>
                    <div class="card-meta">${year} • ${type.toUpperCase()}</div>
                </div>
            </div>
        `;
    }).join('');

    container.insertAdjacentHTML('beforeend', html);
}

// Media Detail & Player Integration
async function openMediaModal(id, type) {
    currentServerIndex = 0;
    try {
        const res = await fetch(`${BASE_URL}/${type}/${id}?api_key=${TMDB_API_KEY}`);
        const data = await res.json();

        currentMedia = {
            id: data.id,
            type: type,
            title: data.title || data.name,
            overview: data.overview,
            rating: data.vote_average ? data.vote_average.toFixed(1) : 'N/A',
            year: (data.release_date || data.first_air_date || 'N/A').split('-')[0],
            poster: data.poster_path,
            season: 1,
            episode: 1,
            seasonDetails: data.seasons || []
        };

        playerTitle.textContent = currentMedia.title;
        playerOverview.textContent = currentMedia.overview;
        playerRating.innerHTML = `<i class="fas fa-star"></i> ${currentMedia.rating}`;
        playerYear.textContent = currentMedia.year;
        playerType.textContent = type.toUpperCase();

        updateWatchlistButtonUI();
        renderServerButtons();

        if (type === 'tv') {
            tvControls.classList.remove('hidden');
            populateSeasons(currentMedia.seasonDetails);
        } else {
            tvControls.classList.add('hidden');
        }

        loadPlayerStream();
        playerModal.classList.remove('hidden');
    } catch (err) {
        console.error('Failed fetching media details:', err);
    }
}

function renderServerButtons() {
    serverSelectorContainer.innerHTML = SERVERS.map((server, index) => `
        <button 
            class="server-btn ${index === currentServerIndex ? 'active' : ''}" 
            onclick="switchServer(${index})">
            ${server.name}
        </button>
    `).join('');
}

function switchServer(index) {
    currentServerIndex = index;
    renderServerButtons();
    loadPlayerStream();
}

function loadPlayerStream() {
    const server = SERVERS[currentServerIndex] || SERVERS[0];
    const streamUrl = currentMedia.type === 'tv'
        ? server.getTvUrl(currentMedia.id, currentMedia.season, currentMedia.episode)
        : server.getMovieUrl(currentMedia.id);

    playerIframe.src = streamUrl;
}

// Populate TV Dropdowns
function populateSeasons(seasons) {
    const validSeasons = seasons.filter(s => s.season_number > 0);
    seasonSelect.innerHTML = validSeasons.map(s => 
        `<option value="${s.season_number}">Season ${s.season_number}</option>`
    ).join('');

    if (validSeasons.length > 0) {
        populateEpisodes(validSeasons[0].episode_count);
    }
}

function populateEpisodes(count) {
    let options = '';
    for (let i = 1; i <= count; i++) {
        options += `<option value="${i}">Episode ${i}</option>`;
    }
    episodeSelect.innerHTML = options;
}

// Watchlist Management
function getWatchlist() {
    return JSON.parse(localStorage.getItem('watchlist')) || [];
}

function toggleWatchlist() {
    let list = getWatchlist();
    const index = list.findIndex(item => item.id === currentMedia.id && item.type === currentMedia.type);

    if (index > -1) {
        list.splice(index, 1);
    } else {
        list.push({
            id: currentMedia.id,
            type: currentMedia.type,
            title: currentMedia.title,
            poster_path: currentMedia.poster,
            vote_average: parseFloat(currentMedia.rating),
            release_date: currentMedia.year
        });
    }

    localStorage.setItem('watchlist', JSON.stringify(list));
    updateWatchlistButtonUI();

    if (currentTab === 'watchlist') renderWatchlist();
}

function updateWatchlistButtonUI() {
    const list = getWatchlist();
    const exists = list.some(item => item.id === currentMedia.id && item.type === currentMedia.type);
    watchlistToggleBtn.innerHTML = exists 
        ? `<i class="fas fa-check"></i> In Watchlist`
        : `<i class="fas fa-plus"></i> Add to List`;
}

function renderWatchlist() {
    const list = getWatchlist();
    sectionTitle.textContent = 'My Watchlist';
    renderCards(list, mediaGrid, false);
}
