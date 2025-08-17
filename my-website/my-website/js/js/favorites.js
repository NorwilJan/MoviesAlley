export let favorites = JSON.parse(localStorage.getItem('favorites') || '[]');

export function isFavorite(id, mediaType) {
  return favorites.some(f => f.id === id && f.media_type === mediaType);
}

export function toggleFavorite(id, mediaType) {
  if (isFavorite(id, mediaType)) {
    favorites = favorites.filter(f => f.id !== id || f.media_type !== mediaType);
  } else {
    favorites.push({ id, media_type: mediaType });
  }
  localStorage.setItem('favorites', JSON.stringify(favorites));
  return favorites;
}

export async function renderFavorites(movieList, genres, year, fetchMovieDetails) {
  if (!favorites.length) {
    movieList.innerHTML = `<div class="empty-state">No favorites yet ❤️.</div>`;
    return;
  }
  try {
    const items = await Promise.all(favorites.map(async item => {
      const data = await fetchMovieDetails(item.id, item.media_type);
      return data ? { ...data, media_type: item.media_type } : null;
    }));
    let filteredItems = items.filter(item => item && item.id);
    if (genres) filteredItems = filteredItems.filter(item => item.genres?.some(g => g.id === parseInt(genres)));
    if (year) filteredItems = filteredItems.filter(item => {
      const date = item.media_type === 'tv' ? item.first_air_date : item.release_date;
      return date && date.startsWith(year);
    });
    renderMovies(filteredItems, movieList, true);
  } catch (error) {
    console.error('Error rendering favorites:', error);
    movieList.innerHTML = `<div class="error-state">Failed to load favorites.</div>`;
  }
}