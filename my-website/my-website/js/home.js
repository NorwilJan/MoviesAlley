const API_KEY = '40f1982842db35042e8561b13b38d492';
const IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/w500';

export async function fetchGenres() {
  try {
    const [movieRes, tvRes] = await Promise.all([
      fetch(`https://api.themoviedb.org/3/genre/movie/list?api_key=${API_KEY}`),
      fetch(`https://api.themoviedb.org/3/genre/tv/list?api_key=${API_KEY}`)
    ]);
    if (!movieRes.ok || !tvRes.ok) throw new Error('Failed to fetch genres');
    const [movieData, tvData] = await Promise.all([movieRes.json(), tvRes.json()]);
    return { movieGenres: movieData.genres || [], tvGenres: tvData.genres || [] };
  } catch (error) {
    console.error('Error fetching genres:', error);
    return { movieGenres: [], tvGenres: [] };
  }
}

export async function fetchMoviesInf(page, mode, query, genre, year, netflixType) {
  const isTablet = window.matchMedia("(min-width: 768px) and (max-width: 1199.98px)").matches;
  const perPage = isTablet ? 40 : 20;
  let url = '';

  if (mode === 'search' && query.trim()) {
    url = `https://api.themoviedb.org/3/search/multi?api_key=${API_KEY}&query=${encodeURIComponent(query)}&page=${page}&include_adult=false`;
  } else if (mode === 'anime') {
    url = `https://api.themoviedb.org/3/discover/movie?api_key=${API_KEY}&with_genres=${genre || 16}&with_original_language=ja${year ? `&primary_release_year=${year}` : ''}&sort_by=popularity.desc&page=${page}`;
  } else if (mode === 'tagalog') {
    url = `https://api.themoviedb.org/3/discover/movie?api_key=${API_KEY}&with_original_language=tl${genre ? `&with_genres=${genre}` : ''}${year ? `&primary_release_year=${year}` : ''}&sort_by=popularity.desc&page=${page}`;
  } else if (mode === 'tv') {
    url = `https://api.themoviedb.org/3/discover/tv?api_key=${API_KEY}${genre ? `&with_genres=${genre}` : ''}${year ? `&first_air_date_year=${year}` : ''}&sort_by=popularity.desc&page=${page}`;
  } else if (mode === 'netflix') {
    url = `https://api.themoviedb.org/3/discover/${netflixType}?api_key=${API_KEY}&with_watch_providers=8&watch_region=US${genre ? `&with_genres=${genre}` : ''}${year ? `&${netflixType === 'movie' ? 'primary_release_year' : 'first_air_date_year'}=${year}` : ''}&sort_by=popularity.desc&page=${page}`;
  } else {
    url = `https://api.themoviedb.org/3/discover/movie?api_key=${API_KEY}${genre ? `&with_genres=${genre}` : ''}${year ? `&primary_release_year=${year}` : ''}&sort_by=popularity.desc&page=${page}`;
  }

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
    const data = await response.json();
    return { results: data.results?.slice(0, perPage) || [], totalPages: Math.min(data.total_pages || 1, 100) };
  } catch (error) {
    console.error('Error fetching movies:', error);
    return { results: [], totalPages: 1 };
  }
}

export async function fetchMovieDetails(id, type = 'movie') {
  try {
    const response = await fetch(`https://api.themoviedb.org/3/${type}/${id}?api_key=${API_KEY}&append_to_response=credits,videos`);
    if (!response.ok) throw new Error('Failed to fetch details');
    return await response.json();
  } catch (error) {
    console.error(`Error fetching ${type} details:`, error);
    return null;
  }
}

export async function fetchSimilarMovies(id) {
  try {
    const response = await fetch(`https://api.themoviedb.org/3/movie/${id}/similar?api_key=${API_KEY}`);
    if (!response.ok) throw new Error('Failed to fetch similar movies');
    const data = await response.json();
    return data.results?.slice(0, 8) || [];
  } catch (error) {
    console.error('Error fetching similar movies:', error);
    return [];
  }
}

export async function fetchSeasonDetails(showId, seasonNumber) {
  try {
    const response = await fetch(`https://api.themoviedb.org/3/tv/${showId}/season/${seasonNumber}?api_key=${API_KEY}`);
    if (!response.ok) throw new Error('Failed to fetch season details');
    return await response.json();
  } catch (error) {
    console.error('Error fetching season details:', error);
    return { episodes: [] };
  }
}