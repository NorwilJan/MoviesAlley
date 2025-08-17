import { fetchMovieDetails, fetchSimilarMovies, fetchSeasonDetails } from './api.js';
import { addRecentlyViewed, renderRecentlyViewed } from './recentlyViewed.js';
import { isFavorite, toggleFavorite } from './favorites.js';

export let lastModalMovie = null;
export let tvModalData = { tvId: null, season: null, episode: null, seasons: [] };

export function showDetails(movie) {
  const modal = document.getElementById('modal');
  const movieContent = document.getElementById('modal-content-movie');
  const tvContent = document.getElementById('modal-content-tv');
  movieContent.style.display = 'block';
  tvContent.style.display = 'none';
  modal.style.display = 'flex';
  document.getElementById('bmc-hover-btn').classList.remove('visible');
  lastModalMovie = movie;
  addRecentlyViewed(movie);
  renderRecentlyViewed();

  document.getElementById('modal-title').textContent = movie.title || 'N/A';
  document.getElementById('modal-description').textContent = movie.overview || 'No description available.';
  document.getElementById('modal-image').src = movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : 'assets/images/no-poster.png';
  document.getElementById('modal-rating').innerHTML = getStars(movie.vote_average || 0) + ` (${movie.vote_average || 'N/A'})`;
  document.getElementById('modal-genres').innerHTML = (movie.genres || movie.genre_ids || []).map(g => {
    const genre = typeof g === 'object' ? g : window.movieGenres?.find(x => x.id === g) || { name: '' };
    return genre.name ? `<span class="chip">${genre.name}</span>` : '';
  }).join(' ');

  document.getElementById('modal-cast').textContent = 'Loading cast...';
  document.getElementById('modal-crew').textContent = '';
  document.getElementById('modal-trailer').innerHTML = '';

  fetchMovieDetails(movie.id, 'movie').then(data => {
    if (data) {
      const cast = data.credits?.cast?.slice(0, 5).map(c => c.name).join(', ') || '';
      const director = data.credits?.crew?.find(c => c.job === 'Director')?.name || '';
      document.getElementById('modal-cast').innerHTML = cast ? `<strong>Cast:</strong> ${cast}` : '';
      document.getElementById('modal-crew').innerHTML = director ? `<strong>Director:</strong> ${director}` : '';
      const trailer = data.videos?.results?.find(v => v.site === 'YouTube' && v.type === 'Trailer');
      if (trailer) {
        document.getElementById('modal-trailer').innerHTML = `<a href="https://youtube.com/watch?v=${trailer.key}" target="_blank" rel="noopener" aria-label="Watch trailer">▶ Watch Official Trailer</a>`;
      }
    }
  });

  document.getElementById('server').value = 'player.videasy.net';
  changeServer();

  fetchSimilarMovies(movie.id).then(similar => {
    const similarMoviesDiv = document.getElementById('similar-movies');
    if (similar.length) {
      similarMoviesDiv.innerHTML = `
        <div style="margin-top: 1.3em;">
          <b>Similar Movies:</b>
          <div style="display: flex; gap: 1em; overflow-x: auto; padding-top: 0.7em;">
            ${similar.map(m => `
              <div style="width: 110px; text-align: center;">
                <img loading="lazy" src="${m.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : 'assets/images/no-poster.png'}" alt="${m.title}" style="width: 100px; border-radius: 7px; cursor: pointer;" onclick="showDetailsFromId(${m.id})">
                <div style="font-size: 0.93em; margin-top: 0.3em;">${m.title}</div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    } else {
      similarMoviesDiv.innerHTML = '';
    }
  });
}

export function showTvDetails(show) {
  const modal = document.getElementById('modal');
  const movieContent = document.getElementById('modal-content-movie');
  const tvContent = document.getElementById('modal-content-tv');
  movieContent.style.display = 'none';
  tvContent.style.display = 'block';
  modal.style.display = 'flex';
  document.getElementById('bmc-hover-btn').classList.remove('visible');
  tvModalData = { tvId: show.id, season: null, episode: null, seasons: [] };
  addRecentlyViewed(show);
  renderRecentlyViewed();

  document.getElementById('tv-modal-title').textContent = show.name || 'N/A';
  document.getElementById('tv-modal-description').textContent = show.overview || 'No description available.';
  document.getElementById('tv-modal-image').src = show.poster_path ? `https://image.tmdb.org/t/p/w500${show.poster_path}` : 'assets/images/no-poster.png';
  document.getElementById('tv-modal-genres').innerHTML = (show.genres || show.genre_ids || []).map(g => {
    const genre = typeof g === 'object' ? g : window.tvGenres?.find(x => x.id === g) || { name: '' };
    return genre.name ? `<span class="chip">${genre.name}</span>` : '';
  }).join(' ');
  document.getElementById('tv-modal-air-date').textContent = show.first_air_date || 'N/A';
  document.getElementById('tv-modal-total-seasons').textContent = show.number_of_seasons || 'N/A';
  const favoriteBtn = document.getElementById('tv-favorite-btn');
  favoriteBtn.classList.toggle('favorited', isFavorite(show.id, 'tv'));
  favoriteBtn.onclick = () => toggleFavorite(show.id, 'tv');
  document.getElementById('tv-episode-player').style.display = 'none';
  document.getElementById('tv-episode-next-btn').style.display = 'none';
  document.getElementById('tv-modal-seasons-list').innerHTML = '<p>Loading seasons...</p>';

  fetchMovieDetails(show.id, 'tv').then(data => {
    if (data) {
      tvModalData.seasons = data.seasons?.filter(s => s.season_number >= 0) || [];
      Promise.all(tvModalData.seasons.map(async season => {
        const seasonData = await fetchSeasonDetails(show.id, season.season_number);
        return `
          <div class="season-block">
            <div class="season-header" onclick="toggleSeason(${season.season_number})" role="button" aria-label="Toggle Season ${season.season_number}">
              Season ${season.season_number} (${seasonData.episodes?.length || 0} Episodes)
            </div>
            <div class="episodes-list" id="season-${season.season_number}" style="display: none;">
              ${seasonData.episodes?.map(ep => `
                <div class="episode-block">
                  <span>Episode ${ep.episode_number}: ${ep.name}</span>
                  <button class="tv-episode-play-btn" onclick="playEpisode(${show.id}, ${season.season_number}, ${ep.episode_number})" aria-label="Play Episode ${ep.episode_number}">Play</button>
                </div>
              `).join('')}
            </div>
          </div>
        `;
      })).then(seasonsHtml => {
        document.getElementById('tv-modal-seasons-list').innerHTML = seasonsHtml.join('');
      }).catch(error => {
        console.error('Error loading seasons:', error);
        document.getElementById('tv-modal-seasons-list').innerHTML = '<p class="error-state">Failed to load seasons.</p>';
      });
    }
  });
}

export function closeModal() {
  document.getElementById('modal').style.display = 'none';
  const iframes = [document.getElementById('modal-video'), document.getElementById('tv-episode-player')];
  iframes.forEach(iframe => {
    iframe.src = '';
    iframe.parentElement.querySelector('.iframe-play-overlay').style.display = 'block';
  });
  lastModalMovie = null;
  tvModalData = { tvId: null, season: null, episode: null, seasons: [] };
  if (window.scrollY > 400) {
    document.getElementById('bmc-hover-btn').classList.add('visible');
  }
}

export function changeServer() {
  if (!lastModalMovie) return;
  const serverSelect = document.getElementById('server');
  const iframe = document.getElementById('modal-video');
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

  iframe.src = embedURL;
  iframe.onload = () => {
    try {
      iframe.contentWindow.postMessage('{"event":"command","func":"playVideo","args":""}', '*');
      playOverlay.style.display = 'none';
    } catch (error) {
      console.error('Error starting playback:', error);
      showErrorMessage(iframe, 'Failed to start playback. Try another server.');
    }
  };
  iframe.onerror = () => {
    showErrorMessage(iframe, 'Failed to load video. Try another server.');
    playOverlay.style.display = 'block';
  };
}

export function triggerIframePlay(iframeId) {
  const iframe = document.getElementById(iframeId);
  const playOverlay = iframe.parentElement.querySelector('.iframe-play-overlay');
  try {
    iframe.contentWindow.postMessage('{"event":"command","func":"playVideo","args":""}', '*');
    playOverlay.style.display = 'none';
  } catch (error) {
    console.error(`Error playing ${iframeId}:`, error);
    showErrorMessage(iframe, 'Failed to start playback. Try another server.');
  }
}

export function shareMovie() {
  if (!lastModalMovie) return;
  const title = encodeURIComponent(lastModalMovie.title);
  const url = `https://www.themoviedb.org/movie/${lastModalMovie.id}`;
  const text = `Check out ${lastModalMovie.title} on MovieDck!`;
  if (navigator.share && /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) {
    navigator.share({ title: lastModalMovie.title, text, url })
      .catch(err => console.error('Error sharing movie:', err));
  } else {
    navigator.clipboard.writeText(`${text} ${url}`)
      .then(() => alert('Link copied to clipboard!'))
      .catch(err => console.error('Clipboard error:', err));
  }
}

export function shareTvShow() {
  if (!tvModalData.tvId) return;
  const title = encodeURIComponent(document.getElementById('tv-modal-title').textContent);
  const url = `https://www.themoviedb.org/tv/${tvModalData.tvId}`;
  const text = `Check out ${title} on MovieDck!`;
  if (navigator.share && /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) {
    navigator.share({ title, text, url })
      .catch(err => console.error('Error sharing TV show:', err));
  } else {
    navigator.clipboard.writeText(`${text} ${url}`)
      .then(() => alert('Link copied to clipboard!'))
      .catch(err => console.error('Clipboard error:', err));
  }
}

export async function playEpisode(showId, season, episode) {
  tvModalData.season = season;
  tvModalData.episode = episode;
  document.getElementById('bmc-hover-btn').classList.remove('visible');
  const iframe = document.getElementById('tv-episode-player');
  const playOverlay = iframe.parentElement.querySelector('.iframe-play-overlay');
  const server = document.getElementById('server').value;
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
      console.error('Error playing episode:', e);
      showErrorMessage(iframe, 'Failed to start playback. Try another server.');
    }
  };
  iframe.onerror = () => {
    showErrorMessage(iframe, 'Failed to load episode. Try another server.');
    playOverlay.style.display = 'block';
  };
  document.getElementById('tv-episode-next-btn').style.display = 'block';
  updateNextEpisodeButton(showId, season, episode);
}

async function updateNextEpisodeButton(showId, season, episode) {
  const btn = document.getElementById('tv-episode-next-btn');
  try {
    const data = await fetchSeasonDetails(showId, season);
    const episodes = data.episodes || [];
    const nextEpisode = episodes.find(ep => ep.episode_number === episode + 1);
    if (nextEpisode) {
      btn.textContent = `Next Episode: ${nextEpisode.name}`;
      btn.onclick = () => playEpisode(showId, season, episode + 1);
    } else if (tvModalData.seasons.some(s => s.season_number === season + 1)) {
      btn.textContent = `Next Season`;
      btn.onclick = () => playEpisode(showId, season + 1, 1);
    } else {
      btn.style.display = 'none';
    }
  } catch (e) {
    console.error('Error updating next episode:', e);
    btn.style.display = 'none';
  }
}

function getStars(vote) {
  const stars = Math.round((vote || 0) / 2);
  return '★'.repeat(stars) + '☆'.repeat(5 - stars);
}

function showErrorMessage(iframe, message) {
  const modalBody = iframe.closest('.modal-content').querySelector('.modal-body');
  const existingError = modalBody.querySelector('.error-state');
  if (existingError) existingError.remove();
  const errorMsg = document.createElement('p');
  errorMsg.className = 'error-state';
  errorMsg.textContent = message;
  modalBody.appendChild(errorMsg);
  setTimeout(() => errorMsg.remove(), 5000);
}