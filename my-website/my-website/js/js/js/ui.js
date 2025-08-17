import { fetchMoviesInf } from './api.js';
import { isFavorite, toggleFavorite } from './favorites.js';
import { showDetails, showTvDetails } from './modal.js';

export let currentMode = 'popular';
export let currentQuery = '';
export let currentGenre = '';
export let currentYear = '';
export let netflixType = 'movie';
export let currentPage = 1;
export let totalPages = 1;
export let categoryItems = [];
export let isLoading = false;
export let reachedEnd = false;
const loadedPages = new Set();
const maxPages = 100;
const maxItems = 500;

export function renderMovies(items, movieList, clear = false) {
  if (clear) movieList.innerHTML = '';
  if (!items || !items.length) {
    movieList.innerHTML = `<div class="empty-state">No items found for "${currentQuery || 'this category'}"${currentGenre ? ` in genre ${currentGenre}` : ''}${currentYear ? ` from ${currentYear}` : ''}.</div>`;
    return;
  }
  const fragment = document.createDocumentFragment();
  items.forEach(item => {
    const isTv = item.media_type === 'tv' || (item.name && !item.title);
    const mediaType = isTv ? 'tv' : 'movie';
    const movieDiv = document.createElement('div');
    movieDiv.className = 'movie-col';
    movieDiv.setAttribute('role', 'listitem');
    movieDiv.innerHTML = `
      <div class="movie-poster-wrapper" tabindex="0" aria-label="View ${isTv ? item.name : item.title}">
        <img loading="lazy" src="${item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : 'assets/images/no-poster.png'}" alt="${isTv ? item.name : item.title}" class="img-fluid movie-poster-img">
        <button class="play-btn-centered" type="button" title="${isTv ? 'View TV Show' : 'Play Movie'}" aria-label="${isTv ? 'View TV Show' : 'Play Movie'}">
          <i class="fas fa-${isTv ? 'tv' : 'play'}"></i>
        </button>
        <button class="favorite-btn${isFavorite(item.id, mediaType) ? ' favorited' : ''}" title="Add to favorites" aria-label="Add to favorites" tabindex="0">
          <i class="fas fa-heart"></i>
        </button>
      </div>
      <div class="movie-metadata">
        <span class="movie-title" title="${isTv ? item.name : item.title}">${isTv ? item.name : item.title}</span>
        <span class="movie-year">${(isTv ? item.first_air_date : item.release_date)?.slice(0, 4) || ''}</span>
        ${isTv ? '<span class="movie-type" style="font-size: 0.9em; color: #1976d2;">TV Show</span>' : ''}
      </div>
    `;
    movieDiv.querySelector('.play-btn-centered').addEventListener('click', () => {
      isTv ? showTvDetails(item) : showDetails(item);
    });
    movieDiv.querySelector('.favorite-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      toggleFavorite(item.id, mediaType);
      updateFavoriteButtons(item.id, mediaType);
    });
    fragment.appendChild(movieDiv);
  });
  movieList.appendChild(fragment);
}

export async function loadMoreMovies(clear = false) {
  if (isLoading || reachedEnd || currentPage > maxPages) return;
  isLoading = true;
  const movieList = document.getElementById('movie-list');
  const infiniteLoader = document.getElementById('infinite-loader');
  if (clear) {
    movieList.innerHTML = '<div class="loading-state">Loading...</div>';
    categoryItems = [];
  }
  infiniteLoader.style.display = 'block';
  const { results, totalPages: newTotalPages } = await fetchMoviesInf(currentPage, currentMode, currentQuery, currentGenre, currentYear, netflixType);
  totalPages = newTotalPages;
  if (results.length) {
    if (clear) categoryItems = results;
    else categoryItems = [...categoryItems, ...results].slice(0, maxItems);
    renderMovies(results, movieList, clear);
    currentPage++;
    if (currentPage > totalPages) reachedEnd = true;
  } else {
    reachedEnd = true;
    if (clear && !categoryItems.length) {
      movieList.innerHTML = `<div class="empty-state">No items found for "${currentQuery || 'this category'}"${currentGenre ? ` in genre ${currentGenre}` : ''}${currentYear ? ` from ${currentYear}` : ''}.</div>`;
    }
  }
  isLoading = false;
  infiniteLoader.style.display = 'none';
}

export function resetInfiniteScroll() {
  currentPage = 1;
  totalPages = 1;
  loadedPages.clear();
  reachedEnd = false;
  categoryItems = [];
  isLoading = false;
  loadMoreMovies(true);
}

export function switchMode(newMode) {
  if (currentMode === newMode && !(newMode === 'search' && currentQuery)) return;
  currentMode = newMode;
  if (newMode !== 'search') currentQuery = '';
  currentGenre = '';
  currentYear = '';
  netflixType = newMode === 'netflix' ? netflixType : 'movie';
  const sectionTitle = document.getElementById('section-title');
  const titles = {
    popular: 'Trending Movies',
    tv: 'Trending TV Shows',
    anime: 'Trending Anime Movies',
    tagalog: 'Trending Tagalog Movies',
    netflix: `Trending Netflix ${netflixType === 'movie' ? 'Movies' : 'TV Shows'}`,
    favorites: 'Your Favorite Movies & TV Shows',
    search: `Search Results for "${currentQuery}"`
  };
  sectionTitle.textContent = titles[newMode] || 'Trending Movies';
  setActiveNav(newMode);
  populateGenreFilter();
  populateYearFilter();
  resetInfiniteScroll();
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
  if (navIds[mode]) document.getElementById(navIds[mode]).classList.add('active');
}

export function populateGenreFilter() {
  const genreFilter = document.getElementById('genre-filter');
  genreFilter.innerHTML = '<option value="" id="genre-all">All Genres</option>';
  let genres = [];
  if (currentMode === 'tv') genres = window.tvGenres;
  else if (currentMode === 'anime') genres = [
    { id: 16, name: 'Anime' },
    { id: 10765, name: 'Sci-Fi & Fantasy' },
    { id: 28, name: 'Action' },
    { id: 12, name: 'Adventure' },
    { id: 35, name: 'Comedy' },
    { id: 18, name: 'Drama' },
    { id: 10749, name: 'Romance' },
    { id: 14, name: 'Fantasy' }
  ];
  else if (currentMode === 'netflix') genres = netflixType === 'movie' ? window.movieGenres : window.tvGenres;
  else if (currentMode === 'favorites') genres = [...new Set([...window.movieGenres, ...window.tvGenres])].sort((a, b) => a.name.localeCompare(b.name));
  else genres = window.movieGenres;

  genres.forEach((genre, index) => {
    const option = document.createElement('option');
    option.value = genre.id;
    option.id = `genre-${index}`;
    option.textContent = genre.name;
    genreFilter.appendChild(option);
  });
  genreFilter.value = currentGenre || '';
  genreFilter.setAttribute('aria-activedescendant', genreFilter.options[genreFilter.selectedIndex]?.id || '');
}

export function populateYearFilter() {
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
  yearFilter.value = currentYear || '';
  yearFilter.setAttribute('aria-activedescendant', yearFilter.options[yearFilter.selectedIndex]?.id || '');
}

function updateFavoriteButtons(id, mediaType) {
  document.querySelectorAll('.favorite-btn').forEach(btn => {
    if (btn.closest('.movie-col')?.innerHTML.includes(`${mediaType}/${id}`)) {
      btn.classList.toggle('favorited', isFavorite(id, mediaType));
    }
  });
  const tvFavoriteBtn = document.getElementById('tv-favorite-btn');
  if (tvFavoriteBtn && window.tvModalData.tvId === id && mediaType === 'tv') {
    tvFavoriteBtn.classList.toggle('favorited', isFavorite(id, 'tv'));
  }
}