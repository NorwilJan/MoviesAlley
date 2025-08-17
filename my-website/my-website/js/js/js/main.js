import { fetchGenres } from './api.js';
import { renderFavorites } from './favorites.js';
import { renderRecentlyViewed } from './recentlyViewed.js';
import { closeModal, showDetailsFromId, shareMovie, shareTvShow, triggerIframePlay, changeServer, playEpisode } from './modal.js';
import { switchMode, loadMoreMovies, populateGenreFilter, populateYearFilter, resetInfiniteScroll } from './ui.js';

window.movieGenres = [];
window.tvGenres = [];
window.showDetailsFromId = showDetailsFromId;
window.toggleSeason = (seasonNumber) => {
  const seasonDiv = document.getElementById(`season-${seasonNumber}`);
  seasonDiv.style.display = seasonDiv.style.display === 'none' ? 'block' : 'none';
};
window.playEpisode = playEpisode;

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

function handleFullscreenOrientation(iframe) {
  if (!/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) return;
  iframe.addEventListener('fullscreenchange', () => {
    if (document.fullscreenElement === iframe && screen.orientation && screen.orientation.lock) {
      screen.orientation.lock('landscape').catch(err => console.warn('Orientation lock failed:', err));
    } else if (screen.orientation && screen.orientation.unlock) {
      screen.orientation.unlock().catch(err => console.warn('Orientation unlock failed:', err));
    }
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  const movieIframe = document.getElementById('modal-video');
  const tvIframe = document.getElementById('tv-episode-player');
  handleFullscreenOrientation(movieIframe);
  handleFullscreenOrientation(tvIframe);

  const { movieGenres, tvGenres } = await fetchGenres();
  window.movieGenres = movieGenres;
  window.tvGenres = tvGenres;
  populateGenreFilter();
  populateYearFilter();
  document.getElementById('genre-filter').disabled = false;

  renderRecentlyViewed();
  resetInfiniteScroll();

  const switchModeDebounced = throttle(switchMode, 300);
  document.getElementById('nav-movies').addEventListener('click', (e) => {
    e.preventDefault();
    switchModeDebounced('popular');
  });
  document.getElementById('nav-tvshows').addEventListener('click', (e) => {
    e.preventDefault();
    switchModeDebounced('tv');
  });
  document.getElementById('nav-anime').addEventListener('click', (e) => {
    e.preventDefault();
    switchModeDebounced('anime');
  });
  document.getElementById('nav-tagalog').addEventListener('click', (e) => {
    e.preventDefault();
    switchModeDebounced('tagalog');
  });
  document.getElementById('nav-favorites').addEventListener('click', (e) => {
    e.preventDefault();
    switchModeDebounced('favorites');
  });
  document.getElementById('nav-netflix').addEventListener('click', (e) => {
    e.preventDefault();
    const nav = document.getElementById('nav-netflix').parentNode;
    if (!document.getElementById('netflix-switcher')) {
      const switcher = document.createElement('div');
      switcher.id = 'netflix-switcher';
      switcher.style = 'margin-top: 6px; margin-bottom: 2px;';
      switcher.innerHTML = `
        <button id="netflix-movie-btn" class="btn btn-danger btn-sm" style="margin-right: 7px;">Movies</button>
        <button id="netflix-tv-btn" class="btn btn-danger btn-sm">TV Shows</button>
      `;
      nav.appendChild(switcher);
      document.getElementById('netflix-movie-btn').addEventListener('click', () => {
        window.netflixType = 'movie';
        switchModeDebounced('netflix');
      });
      document.getElementById('netflix-tv-btn').addEventListener('click', () => {
        window.netflixType = 'tv';
        switchModeDebounced('netflix');
      });
    }
    switchModeDebounced('netflix');
  });

  document.getElementById('movie-search-form').addEventListener('submit', debounce((e) => {
    e.preventDefault();
    const query = document.getElementById('movie-search-input').value.trim();
    if (!query) {
      document.getElementById('movie-list').innerHTML = `<div class="empty-state">Please enter a search query.</div>`;
      return;
    }
    window.currentQuery = query;
    window.currentGenre = '';
    window.currentYear = '';
    document.getElementById('genre-filter').value = '';
    document.getElementById('year-filter').value = '';
    switchModeDebounced('search');
  }, 300));

  document.getElementById('movie-search-input').addEventListener('input', () => {
    if (!document.getElementById('movie-search-input').value.trim()) {
      window.currentQuery = '';
      switchModeDebounced('popular');
    }
  });

  document.getElementById('genre-filter').addEventListener('change', () => {
    window.currentGenre = document.getElementById('genre-filter').value;
    resetInfiniteScroll();
  });

  document.getElementById('year-filter').addEventListener('change', () => {
    window.currentYear = document.getElementById('year-filter').value;
    resetInfiniteScroll();
  });

  document.getElementById('clear-genre-btn').addEventListener('click', () => {
    window.currentGenre = '';
    window.currentYear = '';
    document.getElementById('genre-filter').value = '';
    document.getElementById('year-filter').value = '';
    resetInfiniteScroll();
  });

  document.getElementById('modal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('modal')) closeModal();
  });

  document.querySelectorAll('.close').forEach(closeBtn => {
    closeBtn.addEventListener('click', closeModal);
    closeBtn.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' || e.key === ' ') closeModal();
    });
  });

  document.getElementById('share-movie-btn').addEventListener('click', shareMovie);
  document.getElementById('share-tv-btn').addEventListener('click', shareTvShow);
  document.getElementById('server').addEventListener('change', changeServer);
  document.querySelectorAll('.iframe-play-overlay').forEach(btn => {
    btn.addEventListener('click', () => triggerIframePlay(btn.parentElement.querySelector('iframe').id));
  });

  window.addEventListener('scroll', throttle(() => {
    const bmcHoverBtn = document.getElementById('bmc-hover-btn');
    if (window.scrollY > 400) {
      document.getElementById('back-to-top').classList.add('visible');
      if (document.getElementById('modal').style.display !== 'flex') {
        bmcHoverBtn.classList.add('visible');
      }
    } else {
      document.getElementById('back-to-top').classList.remove('visible');
      bmcHoverBtn.classList.remove('visible');
    }
    if (window.currentMode === 'favorites') return;
    const { scrollTop, scrollHeight, clientHeight } = document.documentElement;
    if (scrollTop + clientHeight >= scrollHeight - 300 && !window.isLoading && !window.reachedEnd) {
      loadMoreMovies();
    }
  }, 200));

  window.addEventListener('touchend', () => {
    if (window.currentMode === 'favorites') return;
    const { scrollTop, scrollHeight, clientHeight } = document.documentElement;
    if (scrollTop + clientHeight >= scrollHeight - 300 && !window.isLoading && !window.reachedEnd) {
      loadMoreMovies();
    }
  });

  document.getElementById('back-to-top').addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  document.getElementById('bmc-hover-btn').addEventListener('click', () => {
    window.open('https://www.buymeacoffee.com/MovieDckWFPH', '_blank', 'noopener');
  });
});