// CRITICAL FIX: The API key should not be hard-coded in client-side code for production applications.
// It's a security vulnerability. A server-side proxy is recommended.
// For this demonstration, we'll keep it here, but this is a major security flaw to address.
const apiKey = '40f1982842db35042e8561b13b38d492';
const imageBaseUrl = 'https://image.tmdb.org/t/p/w500';
const maxPages = 100;
const maxItems = 500;
let lastModalMovie = null;
let currentPage = 1;
let totalPages = 1;
let currentMode = "popular";
let currentQuery = "";
let currentGenre = "";
let currentYear = "";
let favorites = JSON.parse(localStorage.getItem('favorites') || "[]");
let netflixType = "movie";
let tvModalData = { tvId: null, season: null, episode: null, seasons: [] };
let categoryItems = [];
let isLoading = false;
let reachedEnd = false;
let loadedPages = new Set();
let movieGenres = [];
let tvGenres = [];
const animeGenres = [
  { id: 16, name: "Anime" },
  { id: 10765, name: "Sci-Fi & Fantasy" },
  { id: 28, name: "Action" },
  { id: 12, name: "Adventure" },
  { id: 35, name: "Comedy" },
  { id: 18, name: "Drama" },
  { id: 10749, name: "Romance" },
  { id: 14, name: "Fantasy" }
];
// ENHANCEMENT: Caching DOM elements for performance
const movieList = document.getElementById('movie-list');
const infiniteLoader = document.getElementById('infinite-loader');
const genreFilter = document.getElementById('genre-filter');
const movieIframe = document.getElementById('modal-video');
const tvIframe = document.getElementById('tv-episode-player');
const bmcHoverBtn = document.getElementById('bmc-hover-btn');
const modal = document.getElementById('modal');
const modalContentMovie = document.getElementById('modal-content-movie');
const modalContentTv = document.getElementById('modal-content-tv');
const sectionTitle = document.getElementById('section-title');
const genreFilterForm = document.getElementById('genre-filter-form');
const searchForm = document.getElementById('movie-search-form');
const searchInput = document.getElementById('movie-search-input');
const backToTopBtn = document.getElementById('back-to-top');
const recentlyViewedSection = document.getElementById("recently-viewed-section");
const recentlyViewedList = document.getElementById("recently-viewed-list");
const tvEpisodeNextBtn = document.getElementById('tv-episode-next-btn');
const shareMovieBtn = document.getElementById('share-movie-btn');
const shareTvBtn = document.getElementById('share-tv-btn');
const serverSelect = document.getElementById('server');

// ENHANCEMENT: Refactored function for better organization
function throttle(func, limit) {
  let inThrottle;
  return function (...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

function debounce(func, wait) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

function isMobileOrTablet() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
         window.matchMedia("(max-width: 991.98px)").matches;
}

function handleFullscreenOrientation(iframe) {
  if (!isMobileOrTablet()) return;
  const lockOrientation = () => {
    if (document.fullscreenElement === iframe && screen.orientation && screen.orientation.lock) {
      screen.orientation.lock('landscape').catch(err => {
        console.warn('Orientation lock failed:', err);
        showErrorMessage(iframe, 'Please rotate your device to landscape for the best fullscreen experience.');
      });
    }
  };
  const unlockOrientation = () => {
    if (screen.orientation && screen.orientation.unlock) {
      screen.orientation.unlock().catch(err => console.warn('Orientation unlock failed:', err));
    }
  };
  iframe.addEventListener('fullscreenchange', () => {
    if (document.fullscreenElement === iframe) {
      lockOrientation();
    } else {
      unlockOrientation();
    }
  });
}

function showErrorMessage(iframe, message) {
  const modalBody = iframe.closest('.modal-content').querySelector('.modal-body');
  const existingError = modalBody.querySelector('.error-state');
  if (existingError) existingError.remove();
  const errorMsg = document.createElement('p');
  errorMsg.className = 'error-state';
  errorMsg.textContent = message;
  errorMsg.style.marginTop = '1rem';
  modalBody.appendChild(errorMsg);
  setTimeout(() => errorMsg.remove(), 5000);
}

async function fetchGenres() {
  try {
    const [movieRes, tvRes] = await Promise.all([
      fetch(`https://api.themoviedb.org/3/genre/movie/list?api_key=${apiKey}`),
      fetch(`https://api.themoviedb.org/3/genre/tv/list?api_key=${apiKey}`)
    ]);
    if (!movieRes.ok || !tvRes.ok) throw new Error('Failed to fetch genres');
    const movieData = await movieRes.json();
    const tvData = await tvRes.json();
    movieGenres = movieData.genres || [];
    tvGenres = tvData.genres || [];
    populateGenreFilter();
    genreFilter.disabled = false;
  } catch (e) {
    console.error('Error fetching genres:', e);
    genreFilter.innerHTML = '<option value="" id="genre-all">Failed to load genres</option>';
    genreFilter.disabled = false;
  }
}

function populateGenreFilter() {
  genreFilter.innerHTML = '<option value="" id="genre-all">All Genres</option>';
  let genres = [];
  if (currentMode === "tv") {
    genres = tvGenres;
  } else if (currentMode === "anime") {
    genres = animeGenres;
  } else if (currentMode === "netflix") {
    genres = netflixType === "movie" ? movieGenres : tvGenres;
  } else if (currentMode === "favorites") {
    genres = [...new Set([...movieGenres, ...tvGenres])].sort((a, b) => a.name.localeCompare(b.name));
  } else {
    genres = movieGenres;
  }
  genres.forEach((genre) => {
    const option = document.createElement('option');
    option.value = genre.id;
    option.textContent = genre.name;
    genreFilter.appendChild(option);
  });
  genreFilter.value = currentGenre || "";
  genreFilter.setAttribute('aria-activedescendant', genreFilter.options[genreFilter.selectedIndex]?.id || '');
}

function populateYearFilter() {
  const yearFilter = document.getElementById('year-filter');
  yearFilter.innerHTML = '<option value="" id="year-all">All Years</option>';
  const currentYearNum = new Date().getFullYear();
  for (let year = currentYearNum; year >= 1900; year--) {
    const option = document.createElement('option');
    option.value = year;
    option.id = `year-${year}`;
    option.textContent = year;
    yearFilter.appendChild(option);
  }
  yearFilter.value = currentYear || "";
  yearFilter.setAttribute('aria-activedescendant', yearFilter.options[yearFilter.selectedIndex]?.id || '');
}

function isFavorite(id, media_type) {
  return favorites.some(f => f.id === id && f.media_type === media_type);
}
function toggleFavorite(id, media_type) {
  if (isFavorite(id, media_type)) {
    favorites = favorites.filter(f => f.id !== id || f.media_type !== media_type);
  } else {
    favorites.push({ id, media_type });
  }
  localStorage.setItem('favorites', JSON.stringify(favorites));
  if (currentMode === "favorites") renderFavorites();
  document.querySelectorAll('.favorite-btn').forEach(btn => {
    const parentMovieCol = btn.closest('.movie-col');
    if (parentMovieCol && parentMovieCol.dataset.id == id && parentMovieCol.dataset.mediaType == media_type) {
      btn.classList.toggle('favorited', isFavorite(id, media_type));
    }
  });
}
function renderFavorites() {
  console.log('[renderFavorites] Rendering favorites');
  if (!favorites.length) {
    movieList.innerHTML = `<div class="empty-state">You have no favorite movies or TV shows yet ❤️.</div>`;
    return;
  }
  Promise.all(favorites.map(item =>
    fetch(`https://api.themoviedb.org/3/${item.media_type}/${item.id}?api_key=${apiKey}`)
      .then(r => r.json())
      .then(data => ({ ...data, media_type: item.media_type }))
  )).then(arr => {
    categoryItems = arr.filter(m => m && m.id).slice(0, maxItems);
    let filteredItems = categoryItems;
    if (currentGenre) {
      filteredItems = filteredItems.filter(item =>
        item.genre_ids?.includes(parseInt(currentGenre)) ||
        item.genres?.some(g => g.id === parseInt(currentGenre))
      );
    }
    if (currentYear) {
      filteredItems = filteredItems.filter(item => {
        const year = item.media_type === 'tv' ? (item.first_air_date || '').slice(0, 4) : (item.release_date || '').slice(0, 4);
        return year === currentYear;
      });
    }
    renderMovies(filteredItems, true);
  }).catch(err => {
    console.error('[renderFavorites] Error:', err);
    movieList.innerHTML = `<div class="error-state">Failed to load favorites. Please try again.</div>`;
  });
}
let recentlyViewed = JSON.parse(localStorage.getItem("recently_viewed") || "[]");
function addRecentlyViewed(item) {
  const isTv = !!item.name && !item.title || item.media_type === 'tv';
  recentlyViewed = recentlyViewed.filter(m => m.id !== item.id || m.media_type !== (isTv ? 'tv' : 'movie'));
  recentlyViewed.unshift({
    id: item.id,
    title: item.title || item.name,
    poster_path: item.poster_path,
    release_date: item.release_date || item.first_air_date,
    media_type: isTv ? 'tv' : 'movie'
  });
  if (recentlyViewed.length > 12) recentlyViewed = recentlyViewed.slice(0, 12);
  localStorage.setItem("recently_viewed", JSON.stringify(recentlyViewed));
  renderRecentlyViewed();
}
function renderRecentlyViewed() {
  if (!recentlyViewed.length) {
    recentlyViewedSection.style.display = "none";
    return;
  }
  recentlyViewedSection.style.display = "";
  recentlyViewedList.innerHTML = "";
  const fragment = document.createDocumentFragment();
  recentlyViewed.forEach(item => {
    const div = document.createElement("div");
    div.className = "movie-col";
    div.innerHTML = `
      <div class="movie-poster-wrapper" tabindex="0">
        <img loading="lazy" src="${item.poster_path ? imageBaseUrl + item.poster_path : 'img/no-poster.png'}" alt="${item.title}" class="img-fluid movie-poster-img">
      </div>
      <div class="movie-metadata">
        <span class="movie-title" title="${item.title}">${item.title}</span>
        <span class="movie-year">${item.release_date ? item.release_date.slice(0, 4) : ""}</span>
      </div>
    `;
    div.addEventListener('click', () => {
      fetch(`https://api.themoviedb.org/3/${item.media_type}/${item.id}?api_key=${apiKey}`)
        .then(r => r.json()).then(data => {
          if (item.media_type === 'tv') showTvDetails(data);
          else showDetails(data);
        });
    });
    fragment.appendChild(div);
  });
  recentlyViewedList.appendChild(fragment);
}

async function fetchMoviesInf(page = 1) {
  if (loadedPages.has(page) || page > maxPages) {
    return [];
  }
  let url = "";
  if (currentMode === "favorites") {
    return [];
  }
  const isTablet = window.matchMedia("(min-width: 768px) and (max-width: 1199.98px)").matches;
  const perPage = isTablet ? 40 : 20;
  if (currentMode === "search" && currentQuery.trim()) {
    url = `https://api.themoviedb.org/3/search/multi?api_key=${apiKey}&query=${encodeURIComponent(currentQuery)}&page=${page}&include_adult=false`;
  } else if (currentMode === "anime") {
    url = `https://api.themoviedb.org/3/discover/movie?api_key=${apiKey}&with_genres=${currentGenre || 16}&with_original_language=ja${currentYear ? `&primary_release_year=${currentYear}` : ''}&sort_by=popularity.desc&page=${page}`;
  } else if (currentMode === "tagalog") {
    url = `https://api.themoviedb.org/3/discover/movie?api_key=${apiKey}&with_original_language=tl${currentGenre ? `&with_genres=${currentGenre}` : ''}${currentYear ? `&primary_release_year=${currentYear}` : ''}&sort_by=popularity.desc&page=${page}`;
  } else if (currentMode === "tv") {
    url = `https://api.themoviedb.org/3/discover/tv?api_key=${apiKey}${currentGenre ? `&with_genres=${currentGenre}` : ''}${currentYear ? `&first_air_date_year=${currentYear}` : ''}&sort_by=popularity.desc&page=${page}`;
  } else if (currentMode === "netflix") {
    if (netflixType === "movie") {
      url = `https://api.themoviedb.org/3/discover/movie?api_key=${apiKey}&with_watch_providers=8&watch_region=US${currentGenre ? `&with_genres=${currentGenre}` : ''}${currentYear ? `&primary_release_year=${currentYear}` : ''}&sort_by=popularity.desc&page=${page}`;
    } else {
      url = `https://api.themoviedb.org/3/discover/tv?api_key=${apiKey}&with_watch_providers=8&watch_region=US${currentGenre ? `&with_genres=${currentGenre}` : ''}${currentYear ? `&first_air_date_year=${currentYear}` : ''}&sort_by=popularity.desc&page=${page}`;
    }
  } else {
    url = `https://api.themoviedb.org/3/discover/movie?api_key=${apiKey}${currentGenre ? `&with_genres=${currentGenre}` : ''}${currentYear ? `&primary_release_year=${currentYear}` : ''}&sort_by=popularity.desc&page=${page}`;
  }
  try {
    genreFilter.disabled = true;
    document.getElementById('year-filter').disabled = true;
    if (!url) {
      movieList.innerHTML = `<div class="empty-state">Please enter a search query.</div>`;
      return [];
    }
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.json();
    if (!data.results || data.results.length === 0) {
      movieList.innerHTML = `<div class="empty-state">No items found for "${currentQuery || 'this category'}"${currentGenre ? ` in genre ${currentGenre}` : ''}${currentYear ? ` from ${currentYear}` : ''}.</div>`;
      return [];
    }
    totalPages = Math.min(data.total_pages || 1, maxPages);
    loadedPages.add(page);
    return data.results.slice(0, perPage);
  } catch (e) {
    console.error('[fetchMoviesInf] Error:', e);
    movieList.innerHTML = `<div class="error-state">Failed to load content. Please check your connection or try again later.</div>`;
    infiniteLoader.style.display = "none";
    return [];
  } finally {
    genreFilter.disabled = false;
    document.getElementById('year-filter').disabled = false;
  }
}
// ENHANCEMENT: Refactored render function to use createElement
function renderMovies(items, clear = false) {
  if (clear) movieList.innerHTML = '';
  if (!items || items.length === 0) {
    if (clear) movieList.innerHTML = `<div class="empty-state">No items found.</div>`;
    return;
  }
  const fragment = document.createDocumentFragment();
  items.forEach(item => {
    const isTv = item.media_type === 'tv' || (item.name && !item.title);
    const mediaType = isTv ? 'tv' : 'movie';
    const movieDiv = document.createElement('div');
    movieDiv.className = 'movie-col';
    movieDiv.dataset.id = item.id; // Store data on the element
    movieDiv.dataset.mediaType = mediaType;
    movieDiv.innerHTML = `
      <div class="movie-poster-wrapper" tabindex="0">
        <img loading="lazy" src="${item.poster_path ? imageBaseUrl + item.poster_path : 'img/no-poster.png'}" alt="${isTv ? item.name : item.title}" class="img-fluid movie-poster-img">
        <button class="play-btn-centered" type="button" title="${isTv ? "View TV Show" : "Play Movie"}">
          <i class="fas fa-${isTv ? "tv" : "play"}"></i>
        </button>
        <button class="favorite-btn${isFavorite(item.id, mediaType) ? ' favorited' : ''}" title="Add to favorites" aria-label="Add to favorites" tabindex="0">
          <i class="fas fa-heart"></i>
        </button>
      </div>
      <div class="movie-metadata">
        <span class="movie-title" title="${isTv ? item.name : item.title}">${isTv ? item.name : item.title}</span>
        <span class="movie-year">${(isTv ? item.first_air_date : item.release_date) ? (isTv ? item.first_air_date : item.release_date).slice(0, 4) : ""}</span>
        ${isTv ? '<span class="movie-type" style="font-size: 0.9em; color: var(--color-blue);">TV Show</span>' : ''}
      </div>
    `;
    movieDiv.querySelector('.play-btn-centered').addEventListener('click', () => {
      isTv ? showTvDetails(item) : showDetails(item);
    });
    movieDiv.querySelector('.favorite-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      toggleFavorite(item.id, mediaType);
    });
    fragment.appendChild(movieDiv);
  });
  movieList.appendChild(fragment);
}

async function loadMoreMovies(clear = false) {
  if (isLoading || reachedEnd || currentPage > maxPages) {
    return;
  }
  isLoading = true;
  if (clear) {
    movieList.innerHTML = '<div class="loading-state">Loading...</div>';
    categoryItems = [];
  }
  infiniteLoader.style.display = "block";
  const items = await fetchMoviesInf(currentPage);
  if (items.length > 0) {
    if (clear) categoryItems = items;
    else categoryItems = [...categoryItems, ...items].slice(0, maxItems);
    renderMovies(items, clear);
    currentPage++;
    if (currentPage > totalPages) reachedEnd = true;
  } else {
    reachedEnd = true;
    if (clear && !categoryItems.length) {
      movieList.innerHTML = `<div class="empty-state">No items found for "${currentQuery || 'this category'}"${currentGenre ? ` in genre ${currentGenre}` : ''}${currentYear ? ` from ${currentYear}` : ''}.</div>`;
    }
  }
  isLoading = false;
  infiniteLoader.style.display = "none";
}

function resetInfiniteScroll() {
  currentPage = 1;
  totalPages = 1;
  loadedPages.clear();
  reachedEnd = false;
  categoryItems = [];
  isLoading = false;
  movieList.innerHTML = '<div class="loading-state">Loading...</div>';
  infiniteLoader.style.display = 'block';
  loadMoreMovies(true);
}

async function showDetails(movie) {
  modalContentMovie.style.display = '';
  modalContentTv.style.display = 'none';
  modal.style.display = 'flex';
  bmcHoverBtn.classList.remove('visible');
  lastModalMovie = movie;
  addRecentlyViewed(movie);
  document.getElementById('modal-title').textContent = movie.title;
  document.getElementById('modal-description').textContent = movie.overview || '';
  document.getElementById('modal-image').src = movie.poster_path ? imageBaseUrl + movie.poster_path : 'img/no-poster.png';
  document.getElementById('modal-rating').innerHTML = getStars(movie.vote_average || 0) + ` (${movie.vote_average || 'N/A'})`;
  document.getElementById('modal-genres').innerHTML = (movie.genre_ids || movie.genres || []).map(gid => {
    let g = typeof gid === "object" ? gid : (movieGenres.find(x => x.id === gid) || { name: "" });
    return g.name ? `<span class="chip">${g.name}</span>` : '';
  }).join(' ');
  document.getElementById('modal-cast').textContent = "Loading cast...";
  document.getElementById('modal-crew').textContent = "";
  document.getElementById('modal-trailer').innerHTML = "";
  try {
    const [creditsRes, videosRes, similarRes] = await Promise.all([
      fetch(`https://api.themoviedb.org/3/movie/${movie.id}/credits?api_key=${apiKey}`),
      fetch(`https://api.themoviedb.org/3/movie/${movie.id}/videos?api_key=${apiKey}`),
      fetch(`https://api.themoviedb.org/3/movie/${movie.id}/similar?api_key=${apiKey}`)
    ]);
    const creditsData = await creditsRes.json();
    const videosData = await videosRes.json();
    const similarData = await similarRes.json();
    let cast = (creditsData.cast || []).slice(0, 5).map(c => c.name).join(', ');
    let director = (creditsData.crew || []).find(c => c.job === "Director");
    document.getElementById('modal-cast').innerHTML = cast ? `<strong>Cast:</strong> ${cast}` : '';
    document.getElementById('modal-crew').innerHTML = director ? `<strong>Director:</strong> ${director.name}` : '';
    let yt = (videosData.results || []).find(v => v.site === "YouTube" && v.type === "Trailer");
    if (yt)
      document.getElementById('modal-trailer').innerHTML = `<a href="https://youtube.com/watch?v=${yt.key}" target="_blank" rel="noopener">▶ Watch Official Trailer</a>`;
    if (similarData.results && similarData.results.length) {
      let similarHtml = `<div style="margin-top: 1.3em;"><b>Similar Movies:</b><div style="display: flex; gap: 1em; overflow-x: auto; padding-top: 0.7em;">`;
      similarData.results.slice(0, 8).forEach(m => {
        similarHtml += `<div style="width: 110px; text-align: center;">
          <img loading="lazy" src="${m.poster_path ? imageBaseUrl + m.poster_path : 'img/no-poster.png'}" alt="${m.title}" style="width: 100px; border-radius: 7px; cursor: pointer;" data-movie-id="${m.id}" class="similar-movie-img">
          <div style="font-size: 0.93em; margin-top: 0.3em;">${m.title}</div>
        </div>`;
      });
      similarHtml += `</div></div>`;
      document.getElementById('similar-movies').innerHTML = similarHtml;
      document.querySelectorAll('.similar-movie-img').forEach(img => {
        img.addEventListener('click', () => showDetailsFromId(img.dataset.movieId));
      });
    }
  } catch (e) {
    console.error("Error fetching modal details:", e);
  }
  serverSelect.value = "player.videasy.net";
  changeServer();
}
window.showDetailsFromId = function(id) {
  fetch(`https://api.themoviedb.org/3/movie/${id}?api_key=${apiKey}`)
    .then(r => r.json()).then(showDetails);
}
function getStars(vote) {
  let stars = Math.round((vote || 0) / 2);
  return '★'.repeat(stars) + '☆'.repeat(5 - stars);
}
function changeServer() {
  if (!lastModalMovie) return;
  const iframe = movieIframe;
  const playOverlay = iframe.parentElement.querySelector('.iframe-play-overlay');
  const currentServer = serverSelect.value;
  const movieId = lastModalMovie.id;
  let embedURL = '';
  if (currentServer === 'player.videasy.net') {
    embedURL = `https://player.videasy.net/movie/${movieId}`;
  } else if (currentServer === 'vidsrc.cc') {
    embedURL = `https://vidsrc.cc/v2/embed/movie/${movieId}`;
  } else if (currentServer === 'vidsrc.me') {
    embedURL = `https://vidsrc.net/embed/movie/?tmdb=${movieId}`;
  }
  iframe.src = '';
  iframe.src = embedURL;
  iframe.onload = function() {
    try {
      iframe.contentWindow.postMessage('{"event":"command","func":"playVideo","args":""}', '*');
    } catch (e) {
      console.error('[changeServer] Error sending play message:', e);
      showErrorMessage(iframe, 'Failed to start playback. Try another server or check your connection.');
    }
    playOverlay.style.display = 'none';
  };
  iframe.onerror = () => {
    showErrorMessage(iframe, 'Failed to load video. Try another server or check your connection.');
    playOverlay.style.display = 'block';
  };
}

function triggerIframePlay(iframeId) {
  const iframe = document.getElementById(iframeId);
  const playOverlay = iframe.parentElement.querySelector('.iframe-play-overlay');
  try {
    iframe.contentWindow.postMessage('{"event":"command","func":"playVideo","args":""}', '*');
    playOverlay.style.display = 'none';
  } catch (e) {
    console.error(`[triggerIframePlay] Error for ${iframeId}:`, e);
    showErrorMessage(iframe, 'Failed to start playback. Try another server.');
  }
}

function shareMovie() {
  if (!lastModalMovie) return;
  const title = lastModalMovie.title;
  const url = `https://www.themoviedb.org/movie/${lastModalMovie.id}`;
  const text = `Check out ${title} on MovieDck!`;
  if (navigator.share && isMobileOrTablet()) {
    navigator.share({ title, text, url })
      .catch(err => console.error('[shareMovie] Error:', err));
  } else {
    navigator.clipboard.writeText(`${text} ${url}`)
      .then(() => alert('Link copied to clipboard!'))
      .catch(err => console.error('[shareMovie] Clipboard error:', err));
  }
}

async function showTvDetails(show) {
  modalContentMovie.style.display = 'none';
  modalContentTv.style.display = '';
  modal.style.display = 'flex';
  bmcHoverBtn.classList.remove('visible');
  tvModalData.tvId = show.id;
  tvModalData.season = null;
  tvModalData.episode = null;
  tvModalData.seasons = [];
  addRecentlyViewed(show);
  document.getElementById('tv-modal-title').textContent = show.name || 'N/A';
  document.getElementById('tv-modal-description').textContent = show.overview || '';
  document.getElementById('tv-modal-image').src = show.poster_path ? imageBaseUrl + show.poster_path : 'img/no-poster.png';
  document.getElementById('tv-modal-genres').innerHTML = (show.genre_ids || show.genres || []).map(gid => {
    let g = typeof gid === "object" ? gid : (tvGenres.find(x => x.id === gid) || { name: "" });
    return g.name ? `<span class="chip">${g.name}</span>` : '';
  }).join(' ');
  document.getElementById('tv-modal-air-date').textContent = show.first_air_date || 'N/A';
  document.getElementById('tv-modal-total-seasons').textContent = show.number_of_seasons || 'N/A';
  const favoriteBtn = document.getElementById('tv-favorite-btn');
  favoriteBtn.classList.toggle('favorited', isFavorite(show.id, 'tv'));
  tvIframe.style.display = 'none';
  tvEpisodeNextBtn.style.display = 'none';
  document.getElementById('tv-modal-seasons-list').innerHTML = '<p>Loading seasons...</p>';
  try {
    const res = await fetch(`https://api.themoviedb.org/3/tv/${show.id}?api_key=${apiKey}&append_to_response=credits,videos`);
    const data = await res.json();
    tvModalData.seasons = data.seasons || [];
    let html = '';
    for (let season of tvModalData.seasons.filter(s => s.season_number >= 0)) {
      const seasonRes = await fetch(`https://api.themoviedb.org/3/tv/${show.id}/season/${season.season_number}?api_key=${apiKey}`);
      const seasonData = await seasonRes.json();
      html += `<div class="season-block">
        <div class="season-header" role="button" tabindex="0" aria-expanded="false" aria-controls="season-${season.season_number}" data-season-number="${season.season_number}">Season ${season.season_number} (${seasonData.episodes?.length || 0} Episodes)</div>
        <div class="episodes-list" id="season-${season.season_number}" style="display: none;">`;
      (seasonData.episodes || []).forEach(ep => {
        html += `<div class="episode-block">
          <span>Episode ${ep.episode_number}: ${ep.name}</span>
          <button class="tv-episode-play-btn" data-show-id="${show.id}" data-season-number="${season.season_number}" data-episode-number="${ep.episode_number}">Play</button>
        </div>`;
      });
      html += `</div></div>`;
    }
    document.getElementById('tv-modal-seasons-list').innerHTML = html;
    document.querySelectorAll('.season-header').forEach(header => {
      header.addEventListener('click', () => toggleSeason(header.dataset.seasonNumber));
    });
    document.querySelectorAll('.tv-episode-play-btn').forEach(btn => {
      btn.addEventListener('click', () => playEpisode(btn.dataset.showId, btn.dataset.seasonNumber, btn.dataset.episodeNumber));
    });
  } catch (e) {
    console.error('[showTvDetails] Error:', e);
    document.getElementById('tv-modal-seasons-list').innerHTML = '<p class="error-state">Failed to load seasons.</p>';
  }
}

function toggleSeason(seasonNumber) {
  const seasonDiv = document.getElementById(`season-${seasonNumber}`);
  const header = document.querySelector(`.season-header[data-season-number="${seasonNumber}"]`);
  const isExpanded = seasonDiv.style.display === 'block';
  seasonDiv.style.display = isExpanded ? 'none' : 'block';
  header.setAttribute('aria-expanded', !isExpanded);
}

async function playEpisode(showId, season, episode) {
  tvModalData.season = parseInt(season);
  tvModalData.episode = parseInt(episode);
  bmcHoverBtn.classList.remove('visible');
  const iframe = tvIframe;
  const playOverlay = iframe.parentElement.querySelector('.iframe-play-overlay');
  const server = serverSelect.value;
  let embedURL = '';
  if (server === 'player.videasy.net') {
    embedURL = `https://player.videasy.net/tv/${showId}/${season}/${episode}`;
  } else if (server === 'vidsrc.cc') {
    embedURL = `https://vidsrc.cc/v2/embed/tv/${showId}/${season}/${episode}`;
  } else if (server === 'vidsrc.me') {
    embedURL = `https://vidsrc.net/embed/tv/?tmdb=${showId}&season=${season}&episode=${episode}`;
  }
  iframe.src = '';
  iframe.src = embedURL;
  iframe.style.display = 'block';
  iframe.onload = () => {
    try {
      iframe.contentWindow.postMessage('{"event":"command","func":"playVideo","args":""}', '*');
      playOverlay.style.display = 'none';
    } catch (e) {
      console.error('[playEpisode] Error:', e);
      showErrorMessage(iframe, 'Failed to start playback. Try another server.');
    }
  };
  iframe.onerror = () => {
    showErrorMessage(iframe, 'Failed to load episode. Try another server.');
    playOverlay.style.display = 'block';
  };
  tvEpisodeNextBtn.style.display = 'block';
  updateNextEpisodeButton(showId, season, episode);
}

async function updateNextEpisodeButton(showId, season, episode) {
  const btn = tvEpisodeNextBtn;
  try {
    const res = await fetch(`https://api.themoviedb.org/3/tv/${showId}/season/${season}?api_key=${apiKey}`);
    const data = await res.json();
    const episodes = data.episodes || [];
    const nextEpisode = episodes.find(ep => ep.episode_number === parseInt(episode) + 1);
    if (nextEpisode) {
      btn.textContent = `Next Episode: ${nextEpisode.name}`;
      btn.onclick = () => playEpisode(showId, season, parseInt(episode) + 1);
    } else if (tvModalData.seasons.some(s => s.season_number === parseInt(season) + 1)) {
      btn.textContent = `Next Season`;
      btn.onclick = () => playEpisode(showId, parseInt(season) + 1, 1);
    } else {
      btn.style.display = 'none';
    }
  } catch (e) {
    console.error('[updateNextEpisodeButton] Error:', e);
    btn.style.display = 'none';
  }
}

function shareTvShow() {
  if (!tvModalData.tvId) return;
  const title = document.getElementById('tv-modal-title').textContent;
  const url = `https://www.themoviedb.org/tv/${tvModalData.tvId}`;
  const text = `Check out ${title} on MovieDck!`;
  if (navigator.share && isMobileOrTablet()) {
    navigator.share({ title, text, url })
      .catch(err => console.error('[shareTvShow] Error:', err));
  } else {
    navigator.clipboard.writeText(`${text} ${url}`)
      .then(() => alert('Link copied to clipboard!'))
      .catch(err => console.error('[shareTvShow] Clipboard error:', err));
  }
}

function closeModal() {
  modal.style.display = 'none';
  const iframes = [movieIframe, tvIframe];
  iframes.forEach(iframe => {
    iframe.src = '';
    iframe.parentElement.querySelector('.iframe-play-overlay').style.display = 'block';
  });
  lastModalMovie = null;
  tvModalData = { tvId: null, season: null, episode: null, seasons: [] };
  if (window.scrollY > 400) {
    bmcHoverBtn.classList.add('visible');
  }
}

function setActiveNav(mode) {
  document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active'));
  const navIds = {
    popular: 'nav-movies',
    tv: 'nav-tvshows',
    anime: 'nav-anime',
    tagalog: 'nav-tagalog',
    netflix: 'nav-netflix',
    favorites: 'nav-favorites'
  };
  if (navIds[mode]) {
    document.getElementById(navIds[mode]).classList.add('active');
  }
}

function switchMode(newMode) {
  if (currentMode === newMode && !(newMode === 'search' && currentQuery)) {
    return;
  }
  currentMode = newMode;
  if (newMode !== 'search') {
    currentQuery = "";
  }
  currentGenre = "";
  currentYear = "";
  netflixType = newMode === "netflix" ? netflixType : "movie";
  document.getElementById('nav-favorites').classList.remove('favorited');
  
  const netflixSwitcher = document.getElementById("netflix-switcher");
  if (netflixSwitcher) {
    netflixSwitcher.style.display = (newMode === "netflix") ? "block" : "none";
  }

  const titles = {
    "anime": "Trending Anime Movies",
    "tagalog": "Trending Tagalog Movies",
    "favorites": "Your Favorite Movies & TV Shows",
    "tv": "Trending TV Shows",
    "netflix": `Trending Netflix ${netflixType === "movie" ? "Movies" : "TV Shows"}`,
    "search": `Search Results for "${currentQuery}"`,
    "popular": "Trending Movies"
  };
  sectionTitle.textContent = titles[newMode] || titles.popular;
  
  setActiveNav(newMode);
  
  genreFilter.value = "";
  document.getElementById('year-filter').value = "";
  populateGenreFilter();
  populateYearFilter();
  
  if (newMode === "favorites") {
    genreFilterForm.style.display = 'flex';
    movieList.innerHTML = '';
    infiniteLoader.style.display = 'none';
    renderFavorites();
  } else {
    genreFilterForm.style.display = 'flex';
    resetInfiniteScroll();
  }
}

document.addEventListener("DOMContentLoaded", function () {
  handleFullscreenOrientation(movieIframe);
  handleFullscreenOrientation(tvIframe);
  fetchGenres();
  populateYearFilter();

  const isTablet = window.matchMedia("(min-width: 768px) and (max-width: 1199.98px)").matches;
  movieList.style.minHeight = isTablet ? '150vh' : '100vh';

  window.addEventListener('scroll', () => {
    if (window.scrollY > 400) {
      backToTopBtn.classList.add('visible');
      if (modal.style.display !== 'flex') {
        bmcHoverBtn.classList.add('visible');
      }
    } else {
      backToTopBtn.classList.remove('visible');
      bmcHoverBtn.classList.remove('visible');
    }
  });

  bmcHoverBtn.addEventListener('click', () => {
    window.open('https://www.buymeacoffee.com/MovieDckWFPH', '_blank', 'noopener');
  });

  backToTopBtn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // FIX: Modernized event listeners for navigation and other interactive elements
  document.getElementById('nav-movies').addEventListener('click', (e) => { e.preventDefault(); switchMode('popular'); });
  document.getElementById('nav-tvshows').addEventListener('click', (e) => { e.preventDefault(); switchMode('tv'); });
  document.getElementById('nav-anime').addEventListener('click', (e) => { e.preventDefault(); switchMode('anime'); });
  document.getElementById('nav-tagalog').addEventListener('click', (e) => { e.preventDefault(); switchMode('tagalog'); });
  document.getElementById('nav-favorites').addEventListener('click', (e) => { e.preventDefault(); switchMode('favorites'); });
  document.getElementById('nav-netflix').addEventListener('click', (e) => {
    e.preventDefault();
    let nav = document.getElementById('nav-netflix').parentNode;
    if (!document.getElementById("netflix-switcher")) {
      let switcher = document.createElement("div");
      switcher.id = "netflix-switcher";
      switcher.style.cssText = "margin-top: 6px; margin-bottom: 2px;";
      switcher.innerHTML = `<button id="netflix-movie-btn" class="btn btn-danger btn-sm" style="margin-right: 7px;">Movies</button>
        <button id="netflix-tv-btn" class="btn btn-danger btn-sm">TV Shows</button>`;
      nav.appendChild(switcher);
      document.getElementById("netflix-movie-btn").addEventListener('click', () => {
        netflixType = "movie";
        switchMode('netflix');
      });
      document.getElementById("netflix-tv-btn").addEventListener('click', () => {
        netflixType = "tv";
        switchMode('netflix');
      });
    }
    switchMode('netflix');
  });

  searchForm.addEventListener('submit', debounce((e) => {
    e.preventDefault();
    const query = searchInput.value.trim();
    if (!query) {
      movieList.innerHTML = `<div class="empty-state">Please enter a search query.</div>`;
      return;
    }
    currentQuery = query;
    currentGenre = "";
    currentYear = "";
    genreFilter.value = "";
    document.getElementById('year-filter').value = "";
    switchMode('search');
  }, 300));

  searchInput.addEventListener('input', () => {
    if (!searchInput.value.trim()) {
      currentQuery = '';
      switchMode('popular');
    }
  });

  genreFilter.addEventListener('change', () => {
    currentGenre = genreFilter.value;
    resetInfiniteScroll();
  });
  document.getElementById('year-filter').addEventListener('change', () => {
    currentYear = document.getElementById('year-filter').value;
    resetInfiniteScroll();
  });
  document.getElementById('clear-genre-btn').addEventListener('click', () => {
    currentGenre = "";
    currentYear = "";
    genreFilter.value = "";
    document.getElementById('year-filter').value = "";
    resetInfiniteScroll();
  });

  window.addEventListener('scroll', throttle(() => {
    if (currentMode === 'favorites') return;
    const { scrollTop, scrollHeight, clientHeight } = document.documentElement;
    if (scrollTop + clientHeight >= scrollHeight - 300 && !isLoading && !reachedEnd) {
      loadMoreMovies();
    }
  }, 200));

  window.addEventListener('touchend', () => {
    if (currentMode === 'favorites') return;
    const { scrollTop, scrollHeight, clientHeight } = document.documentElement;
    if (scrollTop + clientHeight >= scrollHeight - 300 && !isLoading && !reachedEnd) {
      loadMoreMovies();
    }
  });

  document.getElementById('close-modal-btn').addEventListener('click', closeModal);
  document.getElementById('close-modal-btn-tv').addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });
  serverSelect.addEventListener('change', changeServer);
  document.getElementById('movie-play-overlay').addEventListener('click', () => triggerIframePlay('modal-video'));
  document.getElementById('tv-play-overlay').addEventListener('click', () => triggerIframePlay('tv-episode-player'));
  shareMovieBtn.addEventListener('click', shareMovie);
  shareTvBtn.addEventListener('click', shareTvShow);
  document.getElementById('tv-favorite-btn').addEventListener('click', () => toggleFavorite(tvModalData.tvId, 'tv'));

  renderRecentlyViewed();
  resetInfiniteScroll();
});