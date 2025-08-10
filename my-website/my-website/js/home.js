// scripts.js

const apiKey = '40f1982842db35042e8561b13b38d492';
const imageBaseUrl = 'https://image.tmdb.org/t/p/w500';

let currentPage = 1;
let currentMode = 'popular';
let currentGenre = '';
let favorites = JSON.parse(localStorage.getItem('favorites') || '[]');
let isLoading = false;
let totalPages = 1;
let loadedPages = new Set();

const movieList = document.getElementById('movie-list');
const genreFilter = document.getElementById('genre-filter');
const infiniteLoader = document.getElementById('infinite-loader');
const backToTopBtn = document.getElementById('back-to-top');

// Utility: Throttle function
function throttle(func, limit) {
  let inThrottle;
  return (...args) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

// Check device type for orientation handling or other purposes
const isMobileOrTablet = () =>
  /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
  window.matchMedia('(max-width: 991.98px)').matches;

// Fetch JSON helper
async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch: ${res.statusText}`);
  return res.json();
}

// Save favorites
function saveFavorites() {
  localStorage.setItem('favorites', JSON.stringify(favorites));
}

// Check if favorite
function isFavorite(id, media_type) {
  return favorites.some((f) => f.id === id && f.media_type === media_type);
}

// Toggle favorite
function toggleFavorite(id, media_type) {
  if (isFavorite(id, media_type)) {
    favorites = favorites.filter((f) => f.id !== id || f.media_type !== media_type);
  } else {
    favorites.push({ id, media_type });
  }
  saveFavorites();
  updateFavoriteButtons();
  if (currentMode === 'favorites') {
    renderFavorites();
  }
}

// Update all favorite buttons on the page
function updateFavoriteButtons() {
  document.querySelectorAll('.favorite-btn').forEach((btn) => {
    const movieCol = btn.closest('.movie-col');
    if (!movieCol) return;
    // Extract id and media_type from stored dataset or element attributes if available
    const id = btn.dataset.id ? Number(btn.dataset.id) : null;
    const media = btn.dataset.mediaType || null;

    if (id && media && isFavorite(id, media)) {
      btn.classList.add('favorited');
    } else {
      btn.classList.remove('favorited');
    }
  });
}

// Render movie/TV show cards
function renderMovies(items, clear = false) {
  if (clear) movieList.innerHTML = '';
  if (!items.length) {
    if (clear) {
      movieList.innerHTML = `<div class="empty-state">No items found${currentGenre ? ` for genre "${currentGenre}"` : ''}.</div>`;
    }
    return;
  }
  const fragment = document.createDocumentFragment();
  items.forEach((item) => {
    const isTv = item.media_type === 'tv' || (!!item.name && !item.title);
    const mediaType = isTv ? 'tv' : 'movie';
    const title = isTv ? item.name : item.title;
    const releaseDate = isTv ? item.first_air_date : item.release_date;
    const poster = item.poster_path ? `${imageBaseUrl}${item.poster_path}` : 'img/no-poster.png';

    const movieCol = document.createElement('div');
    movieCol.className = 'movie-col';
    movieCol.tabIndex = 0;
    movieCol.innerHTML = `
      <div class="movie-poster-wrapper">
        <img
          src="${poster}"
          alt="${title} poster"
          class="movie-poster-img"
          loading="lazy"
          width="200"
          height="300"
          decoding="async"
        />
        <button class="play-btn-centered" type="button" aria-label="${isTv ? 'View TV Show' : 'Play Movie'}">
          <i class="fas fa-${isTv ? 'tv' : 'play'}"></i>
        </button>
        <button class="favorite-btn${isFavorite(item.id, mediaType) ? ' favorited' : ''}" type="button" aria-label="Toggle favorite" data-id="${item.id}" data-media-type="${mediaType}">
          <i class="fas fa-heart"></i>
        </button>
      </div>
      <div class="movie-metadata">
        <span class="movie-title" title="${title}">${title}</span>
        <span class="movie-year">${releaseDate ? releaseDate.slice(0, 4) : ''}</span>
        ${isTv ? `<span class="movie-type" aria-label="TV Show">TV Show</span>` : ''}
      </div>
    `;

    movieCol.querySelector('.play-btn-centered').addEventListener('click', () => {
      if (isTv) {
        showTvDetails(item);
      } else {
        showDetails(item);
      }
    });

    movieCol.querySelector('.favorite-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      toggleFavorite(item.id, mediaType);
    });

    // Keyboard accessibility: enter/space triggers click
    movieCol.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (isTv) showTvDetails(item);
        else showDetails(item);
      }
    });

    fragment.appendChild(movieCol);
  });
  movieList.appendChild(fragment);
  updateFavoriteButtons();
}

// TODO: Implement fetchGenres, loadMoreMovies, showDetails, showTvDetails, modal open/close handlers, infinite scroll, search form, etc., following the logic you had but cleaned and without inline handlers.


// Back to top button visibility toggle
const toggleBackToTopVisibility = throttle(() => {
  if (window.scrollY > 300) {
    backToTopBtn.hidden = false;
    backToTopBtn.setAttribute('aria-hidden', 'false');
    backToTopBtn.classList.add('visible');
  } else {
    backToTopBtn.classList.remove('visible');
    backToTopBtn.setAttribute('aria-hidden', 'true');
    setTimeout(() => (backToTopBtn.hidden = true), 300);
  }
}, 250);

backToTopBtn.addEventListener('click', () => {
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

window.addEventListener('scroll', toggleBackToTopVisibility);

document.addEventListener('DOMContentLoaded', async () => {
  // You will need to add your initialization here:
  // e.g. fetchGenres(), initial movie load, attach event listeners to navigation, search form, modals, etc.
});