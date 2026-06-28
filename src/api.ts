import { Category, Credentials, MovieInfo, SeriesInfo, StreamItem } from "./types";

/**
 * Fetches data from an Xtream API URL using CORS proxies as fallbacks.
 */
export async function fetchWithFallback(url: string): Promise<any> {
  const proxies = [
    `/api/proxy?url=${encodeURIComponent(url)}`,
    `https://corsproxy.io/?${encodeURIComponent(url)}`,
    `https://api.allorigins.win/get?url=${encodeURIComponent(url)}&_=${Date.now()}`,
    `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`
  ];

  let lastError: Error | null = null;

  for (const proxyUrl of proxies) {
    try {
      const res = await fetch(proxyUrl);
      if (res.ok) {
        const text = await res.text();
        let data: any;
        
        try {
          data = JSON.parse(text);
        } catch (e) {
          // If response isn't JSON, throw custom error to skip or report
          throw new Error("O servidor retornou uma resposta inválida (não-JSON).");
        }

        // If AllOrigins is used, response is wrapped inside "contents"
        if (proxyUrl.includes("allorigins")) {
          try {
            data = JSON.parse(data.contents);
          } catch (e) {
            throw new Error("O conteúdo do proxy não pôde ser decodificado como JSON.");
          }
        }
        
        return data;
      }
    } catch (err: any) {
      lastError = err;
    }
  }

  throw lastError || new Error("Não foi possível conectar ao servidor IPTV. Verifique a URL do servidor.");
}

/**
 * Validates Xtream credentials and fetches user info
 */
export async function validateCredentials(creds: Credentials): Promise<any> {
  const url = `${creds.server}/player_api.php?username=${creds.user}&password=${creds.pass}`;
  const res = await fetchWithFallback(url);
  if (!res || (res.user_info && res.user_info.auth === 0)) {
    throw new Error("Usuário ou senha incorretos.");
  }
  return res;
}

/**
 * Fetches categories based on type ('live', 'movie', 'series')
 */
export async function fetchCategories(creds: Credentials, type: "live" | "movie" | "series"): Promise<Category[]> {
  const actionMap = {
    live: "get_live_categories",
    movie: "get_vod_categories",
    series: "get_series_categories"
  };
  const action = actionMap[type];
  const url = `${creds.server}/player_api.php?username=${creds.user}&password=${creds.pass}&action=${action}`;
  const data = await fetchWithFallback(url);
  return Array.isArray(data) ? data : [];
}

/**
 * Fetches stream items based on category and type
 */
export async function fetchStreams(
  creds: Credentials,
  type: "live" | "movie" | "series",
  categoryId: string
): Promise<StreamItem[]> {
  const actionMap = {
    live: "get_live_streams",
    movie: "get_vod_streams",
    series: "get_series"
  };
  const action = actionMap[type];
  const url = `${creds.server}/player_api.php?username=${creds.user}&password=${creds.pass}&action=${action}&category_id=${categoryId}`;
  const data = await fetchWithFallback(url);
  return Array.isArray(data) ? data : [];
}

/**
 * Fetches Movie VOD extra metadata info
 */
export async function fetchMovieInfo(creds: Credentials, streamId: string | number): Promise<MovieInfo> {
  const url = `${creds.server}/player_api.php?username=${creds.user}&password=${creds.pass}&action=get_vod_info&vod_id=${streamId}`;
  return await fetchWithFallback(url);
}

/**
 * Fetches Series season and episode data
 */
export async function fetchSeriesInfo(creds: Credentials, seriesId: string | number): Promise<SeriesInfo> {
  const url = `${creds.server}/player_api.php?username=${creds.user}&password=${creds.pass}&action=get_series_info&series_id=${seriesId}`;
  return await fetchWithFallback(url);
}
