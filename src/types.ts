export interface Credentials {
  server: string;
  user: string;
  pass: string;
}

export interface Category {
  category_id: string;
  category_name: string;
  parent_id: number;
}

export interface StreamItem {
  num: number;
  name: string;
  stream_type: "live" | "movie" | "series";
  stream_id: string | number;
  stream_icon?: string;
  cover?: string;
  added?: string;
  category_id?: string;
  series_id?: string | number;
  container_extension?: string;
  rating?: string;
  releasedate?: string;
}

export interface MovieInfo {
  info: {
    description?: string;
    releasedate?: string;
    rating?: string;
    director?: string;
    genre?: string;
    duration_secs?: number;
    backdrop_path?: string[];
  };
  movie_data?: {
    container_extension?: string;
  };
}

export interface Episode {
  id: string | number;
  episode_num: number | string;
  title: string;
  container_extension?: string;
}

export interface SeriesInfo {
  info: {
    plot?: string;
    description?: string;
    releaseDate?: string;
    rating?: string;
    genre?: string;
    backdrop_path?: string[];
  };
  episodes?: {
    [seasonNumber: string]: Episode[];
  };
}
