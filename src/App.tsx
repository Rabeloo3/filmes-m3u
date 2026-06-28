import React, { useEffect, useState, useRef } from "react";
import { 
  Tv, Play, Film, Layers, Search, LogOut, Calendar, Star, Video, Eye, EyeOff, ArrowLeft, Loader2, Info, Clock, User
} from "lucide-react";
import { Credentials, Category, StreamItem, MovieInfo, SeriesInfo, Episode } from "./types";
import { validateCredentials, fetchCategories, fetchStreams, fetchMovieInfo, fetchSeriesInfo } from "./api";
import HlsPlayer from "./components/HlsPlayer";

export default function App() {
  // Authentication & Session States
  const [server, setServer] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  
  // App Navigation States
  const [currentScreen, setCurrentScreen] = useState<"login" | "loading" | "dashboard" | "inner-app">("loading");
  const [currentFeature, setCurrentFeature] = useState<"live" | "movie" | "series">("live");
  const [innerView, setInnerView] = useState<"categories" | "grid" | "details">("categories");

  // Loading Screen States
  const [loadingText, setLoadingText] = useState("A iniciar sistema...");
  const [loadingProgress, setLoadingProgress] = useState(0);

  // Content Data States
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [streamItems, setStreamItems] = useState<StreamItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedItem, setSelectedItem] = useState<StreamItem | null>(null);
  const [movieDetail, setMovieDetail] = useState<MovieInfo | null>(null);
  const [seriesDetail, setSeriesDetail] = useState<SeriesInfo | null>(null);
  const [selectedSeason, setSelectedSeason] = useState<string>("");
  const [activeStreamUrl, setActiveStreamUrl] = useState<string | null>(null);

  // Expiration & Account Metadata
  const [expirationText, setExpirationText] = useState("Expiração: Verificando...");
  const [isDataFetching, setIsDataFetching] = useState(false);

  // Live Clock State
  const [clockTime, setClockTime] = useState("");

  // Clock tick effect
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      let hours = now.getHours();
      const minutes = String(now.getMinutes()).padStart(2, "0");
      const ampm = hours >= 12 ? "PM" : "AM";
      hours = hours % 12 || 12;
      const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
      setClockTime(
        `${String(hours).padStart(2, "0")}:${minutes} ${ampm} - ${months[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Check persistent session on startup
  useEffect(() => {
    const savedSession = localStorage.getItem("smarters_web_session");
    if (savedSession) {
      try {
        const parsed = JSON.parse(savedSession) as Credentials;
        if (parsed.server && parsed.user && parsed.pass) {
          setServer(parsed.server);
          setUsername(parsed.user);
          setPassword(parsed.pass);
          executeAutoLogin(parsed);
          return;
        }
      } catch (e) {
        localStorage.removeItem("smarters_web_session");
      }
    }
    setCurrentScreen("login");
  }, []);

  // Run premium simulated loading transition
  const runSimulatedLoading = (targetCreds: Credentials): Promise<void> => {
    return new Promise((resolve) => {
      let progress = 0;
      const phrases = [
        "A estabelecer ligação segura...",
        "A autenticar conta com o servidor...",
        "A carregar lista de canais...",
        "A mapear catálogo de Filmes...",
        "A atualizar as Séries recentes...",
        "Quase pronto, a preparar painel..."
      ];

      const interval = setInterval(() => {
        progress += 2;
        if (progress > 100) progress = 100;
        setLoadingProgress(progress);

        // Update phrases incrementally
        const phraseIdx = Math.min(Math.floor((progress / 100) * phrases.length), phrases.length - 1);
        setLoadingText(phrases[phraseIdx]);

        if (progress >= 100) {
          clearInterval(interval);
          resolve();
        }
      }, 70); // Full sequence takes about 3.5 seconds for premium fluid transition
    });
  };

  // Perform validation on Saved Credentials
  const executeAutoLogin = async (targetCreds: Credentials) => {
    setCurrentScreen("loading");
    setLoadingProgress(0);
    setLoadingText("Restaurando sessão...");

    try {
      // Run visual progress loader alongside the validation
      const loaderPromise = runSimulatedLoading(targetCreds);
      
      const validationResult = await validateCredentials(targetCreds);
      setCredentials(targetCreds);

      if (validationResult.user_info?.exp_date) {
        const d = new Date(validationResult.user_info.exp_date * 1000);
        const m = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
        setExpirationText(`Expiração: ${d.getDate()} de ${m[d.getMonth()]} de ${d.getFullYear()}`);
      } else {
        setExpirationText("Expiração: Ilimitado");
      }

      await loaderPromise;
      setCurrentScreen("dashboard");
    } catch (err: any) {
      localStorage.removeItem("smarters_web_session");
      setErrorMsg(err.message || "Erro de autenticação automática.");
      setCurrentScreen("login");
    }
  };

  // Manual form submission handler
  const handleManualLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    
    let formattedServer = server.trim();
    if (formattedServer && !/^https?:\/\//i.test(formattedServer)) {
      formattedServer = `http://${formattedServer}`;
    }
    formattedServer = formattedServer.replace(/\/$/, "");

    const targetCreds: Credentials = {
      server: formattedServer,
      user: username.trim(),
      pass: password.trim()
    };

    setCurrentScreen("loading");
    setLoadingProgress(0);
    setLoadingText("Iniciando ligação...");

    try {
      const loaderPromise = runSimulatedLoading(targetCreds);
      const validationResult = await validateCredentials(targetCreds);
      
      setCredentials(targetCreds);
      localStorage.setItem("smarters_web_session", JSON.stringify(targetCreds));

      if (validationResult.user_info?.exp_date) {
        const d = new Date(validationResult.user_info.exp_date * 1000);
        const m = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
        setExpirationText(`Expiração: ${d.getDate()} de ${m[d.getMonth()]} de ${d.getFullYear()}`);
      } else {
        setExpirationText("Expiração: Ilimitado");
      }

      await loaderPromise;
      setCurrentScreen("dashboard");
    } catch (err: any) {
      setErrorMsg(err.message || "Credenciais incorretas ou servidor inacessível.");
      setCurrentScreen("login");
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("smarters_web_session");
    setCredentials(null);
    setCurrentScreen("login");
    setCategories([]);
    setStreamItems([]);
    setSelectedItem(null);
    setMovieDetail(null);
    setSeriesDetail(null);
    setActiveStreamUrl(null);
  };

  // Open main sub-screens (TV AO VIVO, FILMES, SÉRIES)
  const openFeature = async (feature: "live" | "movie" | "series") => {
    if (!credentials) return;
    setCurrentFeature(feature);
    setSelectedCategory(null);
    setStreamItems([]);
    setSelectedItem(null);
    setSearchQuery("");
    setInnerView("categories");
    setCurrentScreen("inner-app");
    setIsDataFetching(true);

    try {
      const cats = await fetchCategories(credentials, feature);
      setCategories(cats);
    } catch (e) {
      alert("Erro ao buscar categorias do servidor.");
    } finally {
      setIsDataFetching(false);
    }
  };

  // Handles clicking a Category to load the grid data
  const handleSelectCategory = async (cat: Category) => {
    if (!credentials) return;
    setSelectedCategory(cat);
    setSearchQuery("");
    setSelectedItem(null);
    setInnerView("grid");
    setIsDataFetching(true);

    try {
      const items = await fetchStreams(credentials, currentFeature, cat.category_id);
      setStreamItems(items);
    } catch (e) {
      alert("Erro ao carregar conteúdo da categoria.");
    } finally {
      setIsDataFetching(false);
    }
  };

  // Handles selecting an item (VOD/Movie, or Series) to load detailed view
  const handleSelectItem = async (item: StreamItem) => {
    if (!credentials) return;
    setSelectedItem(item);
    setInnerView("details");
    setMovieDetail(null);
    setSeriesDetail(null);
    setIsDataFetching(true);

    try {
      if (currentFeature === "movie") {
        const info = await fetchMovieInfo(credentials, item.stream_id);
        setMovieDetail(info);
      } else if (currentFeature === "series") {
        const info = await fetchSeriesInfo(credentials, item.series_id || item.stream_id);
        setSeriesDetail(info);
        // Default to first season available
        if (info.episodes && Object.keys(info.episodes).length > 0) {
          setSelectedSeason(Object.keys(info.episodes)[0]);
        }
      }
    } catch (e) {
      console.error("Erro ao puxar detalhes do servidor.", e);
    } finally {
      setIsDataFetching(false);
    }
  };

  // Launch a live stream or VOD film
  const playContent = (item: StreamItem) => {
    if (!credentials) return;
    let streamUrl = "";
    if (currentFeature === "live") {
      streamUrl = `${credentials.server}/live/${credentials.user}/${credentials.pass}/${item.stream_id}.ts`;
      // Bypass Mixed Content blocking and CORS by routing through our secure stream proxy
      const proxiedUrl = `/api/stream?url=${encodeURIComponent(streamUrl)}`;
      setActiveStreamUrl(proxiedUrl);
    } else if (currentFeature === "movie") {
      const ext = movieDetail?.movie_data?.container_extension || item.container_extension || "mp4";
      streamUrl = `${credentials.server}/movie/${credentials.user}/${credentials.pass}/${item.stream_id}.${ext}`;
      setActiveStreamUrl(streamUrl);
    }
  };

  // Launch a series episode
  const playEpisode = (episode: Episode) => {
    if (!credentials) return;
    const ext = episode.container_extension || "mp4";
    const streamUrl = `${credentials.server}/series/${credentials.user}/${credentials.pass}/${episode.id}.${ext}`;
    setActiveStreamUrl(streamUrl);
  };

  // Filter lists based on Search input
  const filteredItems = streamItems.filter((item) =>
    item.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const defaultPlaceholder = "https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?q=80&w=600&auto=format&fit=crop";

  return (
    <div className="min-h-screen bg-[#040712] text-slate-100 flex flex-col font-sans select-none antialiased">
      
      {/* 1. PREMIUM LOADING SCREEN */}
      {currentScreen === "loading" && (
        <div className="fixed inset-0 bg-[#050814] z-[100] flex flex-col items-center justify-center p-6">
          <div className="flex items-center justify-center gap-4 animate-cinematic mb-12">
            <Tv className="w-16 h-16 md:w-20 md:h-20 text-indigo-500" />
            <h1 className="text-4xl md:text-6xl font-black text-white tracking-widest">
              RABELO <span className="text-indigo-500">IPTV</span>
            </h1>
          </div>
          <div className="w-full max-w-sm flex flex-col items-center">
            <p className="text-indigo-400 text-xs font-bold uppercase tracking-widest mb-3 h-4 transition-all duration-300">
              {loadingText}
            </p>
            <div className="w-full h-[4px] bg-slate-800/80 rounded-full overflow-hidden shadow-inner">
              <div 
                className="h-full bg-gradient-to-r from-indigo-500 to-cyan-400 transition-all duration-100 ease-out shadow-[0_0_10px_rgba(99,102,241,0.5)]"
                style={{ width: `${loadingProgress}%` }}
              ></div>
            </div>
            <span className="text-[10px] text-slate-500 font-mono mt-2">{loadingProgress}% carregado</span>
          </div>
        </div>
      )}

      {/* 2. LOGIN SCREEN */}
      {currentScreen === "login" && (
        <div className="fixed inset-0 bg-[#050814] z-50 flex items-center justify-center p-4">
          <div className="bg-[#0d1527] border border-slate-800/80 p-8 rounded-2xl shadow-2xl max-w-md w-full space-y-6 transition-all">
            <div className="text-center space-y-2">
              <div className="flex items-center justify-center gap-2">
                <Tv className="w-8 h-8 text-indigo-400" />
                <span className="font-extrabold text-2xl tracking-wider text-white">
                  RABELO <span className="text-indigo-400">IPTV</span>
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Acesse usando suas credenciais Xtream Codes API
              </p>
            </div>

            <form onSubmit={handleManualLogin} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                  Servidor (URL)
                </label>
                <input
                  type="url"
                  required
                  placeholder="http://exemplo.com:8080"
                  value={server}
                  onChange={(e) => setServer(e.target.value)}
                  className="w-full bg-[#050814] border border-slate-800 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none transition-all"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                  Usuário
                </label>
                <input
                  type="text"
                  required
                  placeholder="Seu usuário"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full bg-[#050814] border border-slate-800 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none transition-all"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                  Senha
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-[#050814] border border-slate-800 focus:border-indigo-500 rounded-xl pl-4 pr-11 py-2.5 text-sm text-slate-200 focus:outline-none transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-500 hover:text-indigo-400 transition"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20 text-sm active:scale-98"
              >
                <span>Entrar no Servidor</span>
                <Play className="w-3.5 h-3.5 fill-current" />
              </button>
            </form>

            {errorMsg && (
              <div className="bg-red-950/60 border border-red-500/40 text-red-200 text-xs p-3.5 rounded-xl text-left whitespace-pre-line animate-pulse">
                {errorMsg}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 3. DASHBOARD SCREEN */}
      {currentScreen === "dashboard" && (
        <div className="flex-1 flex flex-col justify-between p-6 max-w-7xl mx-auto w-full h-full">
          {/* Header */}
          <header className="flex flex-col sm:flex-row items-center justify-between w-full border-b border-slate-800/40 pb-4 gap-4">
            <div className="flex items-center gap-4">
              <div className="flex items-baseline font-sans">
                <span className="text-2xl font-light tracking-tight text-white flex items-center gap-1.5">
                  <Tv className="w-6 h-6 text-indigo-400" /> RABELO <span className="font-black tracking-wide text-white">IPTV</span>
                </span>
                <span className="text-[10px] font-bold text-indigo-400 ml-1.5 uppercase bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">Pro</span>
              </div>
              <div className="hidden md:flex items-center gap-1.5 text-xs font-semibold text-slate-400 tracking-wide bg-slate-900/40 px-3.5 py-1.5 rounded-full border border-slate-800/30">
                <Clock className="w-3.5 h-3.5 text-slate-500" />
                <span>{clockTime || "--:--"}</span>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 px-4 py-2 rounded-xl text-xs font-bold transition-all"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Trocar Usuário</span>
              </button>
            </div>
          </header>

          {/* Main options panels */}
          <main className="grid grid-cols-1 lg:grid-cols-3 gap-6 my-12 w-full">
            {/* Live TV Button */}
            <button
              onClick={() => openFeature("live")}
              className="bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-600 rounded-3xl p-8 flex flex-col justify-between shadow-2xl min-h-[280px] hover:scale-[1.02] active:scale-98 transition-all text-left border border-emerald-500/20 group relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 w-48 h-48 bg-white/5 rounded-full blur-2xl translate-x-12 -translate-y-12 transition-all group-hover:scale-125" />
              <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center backdrop-blur-md border border-white/20 shadow-md group-hover:scale-110 transition duration-300">
                <Tv className="w-8 h-8 text-white" />
              </div>
              <div className="space-y-1">
                <span className="text-xs font-bold text-emerald-100 uppercase tracking-widest">Grade em Tempo Real</span>
                <h3 className="text-2xl font-black text-white tracking-wider">TV AO VIVO</h3>
              </div>
            </button>

            {/* Movies Button */}
            <button
              onClick={() => openFeature("movie")}
              className="bg-gradient-to-br from-rose-500 via-red-500 to-amber-500 rounded-3xl p-8 flex flex-col justify-between shadow-2xl min-h-[280px] hover:scale-[1.02] active:scale-98 transition-all text-left border border-rose-500/20 group relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 w-48 h-48 bg-white/5 rounded-full blur-2xl translate-x-12 -translate-y-12 transition-all group-hover:scale-125" />
              <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center backdrop-blur-md border border-white/20 shadow-md group-hover:scale-110 transition duration-300">
                <Play className="w-8 h-8 text-white fill-current" />
              </div>
              <div className="space-y-1">
                <span className="text-xs font-bold text-rose-100 uppercase tracking-widest">Cinema On Demand</span>
                <h3 className="text-2xl font-black text-white tracking-wider">FILMES</h3>
              </div>
            </button>

            {/* Series Button */}
            <button
              onClick={() => openFeature("series")}
              className="bg-gradient-to-br from-violet-600 via-indigo-600 to-sky-500 rounded-3xl p-8 flex flex-col justify-between shadow-2xl min-h-[280px] hover:scale-[1.02] active:scale-98 transition-all text-left border border-violet-500/20 group relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 w-48 h-48 bg-white/5 rounded-full blur-2xl translate-x-12 -translate-y-12 transition-all group-hover:scale-125" />
              <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center backdrop-blur-md border border-white/20 shadow-md group-hover:scale-110 transition duration-300">
                <Layers className="w-8 h-8 text-white" />
              </div>
              <div className="space-y-1">
                <span className="text-xs font-bold text-violet-100 uppercase tracking-widest">Temporadas Completas</span>
                <h3 className="text-2xl font-black text-white tracking-wider">SÉRIES</h3>
              </div>
            </button>
          </main>

          {/* Footer Metadata */}
          <footer className="flex flex-col sm:flex-row items-center justify-between w-full border-t border-slate-800/40 pt-4 text-xs font-medium text-slate-500 gap-2">
            <div className="flex items-center gap-2">
              <Calendar className="w-3.5 h-3.5 text-slate-600" />
              <span>{expirationText}</span>
            </div>
            <div className="flex items-center gap-2">
              <User className="w-3.5 h-3.5 text-slate-600" />
              <span>Conectado: <span className="text-slate-300 font-semibold">{credentials?.user}</span></span>
            </div>
          </footer>
        </div>
      )}

      {/* 4. INNER APP NAVIGATOR SCREEN */}
      {currentScreen === "inner-app" && (
        <div className="flex-1 flex flex-col relative w-full h-screen overflow-hidden">
          
          {/* Active Player Overlay */}
          {activeStreamUrl && (
            <div className="absolute inset-0 z-[110] bg-black">
              <HlsPlayer url={activeStreamUrl} onClose={() => setActiveStreamUrl(null)} />
            </div>
          )}

          {/* View Container */}
          <div className="flex-1 flex flex-col overflow-hidden bg-[#050814] w-full">
            
            {/* SCREEN VIEW A: CATEGORY BROWSER */}
            {innerView === "categories" && (
              <div className="flex-1 flex flex-col p-6 overflow-y-auto">
                <div className="flex items-center gap-4 mb-8 shrink-0">
                  <button
                    onClick={() => setCurrentScreen("dashboard")}
                    className="w-10 h-10 bg-slate-900 border border-slate-800 hover:bg-slate-800 text-white rounded-xl flex items-center justify-center shadow-lg transition-all"
                  >
                    <ArrowLeft className="w-5 h-5" />
                  </button>
                  <h1 className="text-xl md:text-2xl font-black text-white uppercase tracking-wider flex items-center gap-2">
                    {currentFeature === "live" && <Tv className="w-6 h-6 text-emerald-400" />}
                    {currentFeature === "movie" && <Film className="w-6 h-6 text-rose-400" />}
                    {currentFeature === "series" && <Layers className="w-6 h-6 text-violet-400" />}
                    <span>Categorias - {currentFeature === "live" ? "TV ao Vivo" : currentFeature === "movie" ? "Filmes" : "Séries"}</span>
                  </h1>
                </div>

                {isDataFetching ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-slate-500 py-12">
                    <Loader2 className="w-10 h-10 animate-spin text-indigo-500 mb-2" />
                    <p className="text-xs font-bold uppercase tracking-widest">Buscando categorias do servidor...</p>
                  </div>
                ) : categories.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-slate-500 py-12 text-center">
                    <Info className="w-12 h-12 text-slate-600 mb-2" />
                    <p className="text-sm font-semibold">Nenhuma categoria encontrada neste servidor.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 pb-12">
                    {categories.map((cat) => (
                      <button
                        key={cat.category_id}
                        onClick={() => handleSelectCategory(cat)}
                        className="bg-slate-900/60 border border-slate-800/80 hover:border-indigo-500/50 hover:bg-indigo-950/20 rounded-2xl p-5 text-center transition-all flex flex-col items-center justify-center min-h-[120px] gap-3 shadow-lg group focus:ring-2 focus:ring-indigo-500/50"
                      >
                        <div className="w-10 h-10 bg-slate-800/80 rounded-xl flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition duration-300">
                          {currentFeature === "live" && <Tv className="w-5 h-5 text-emerald-400 group-hover:text-white" />}
                          {currentFeature === "movie" && <Film className="w-5 h-5 text-rose-400 group-hover:text-white" />}
                          {currentFeature === "series" && <Layers className="w-5 h-5 text-violet-400 group-hover:text-white" />}
                        </div>
                        <span className="text-xs font-bold text-slate-300 group-hover:text-white truncate w-full uppercase tracking-wide">
                          {cat.category_name}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* SCREEN VIEW B: CONTENT GRID */}
            {innerView === "grid" && (
              <div className="flex-1 flex flex-col overflow-hidden">
                {/* Grid header with back button and Search */}
                <div className="flex flex-col md:flex-row md:items-center gap-4 p-6 sticky top-0 bg-[#050814]/95 backdrop-blur-md z-20 shrink-0 border-b border-slate-900">
                  <div className="flex items-center gap-4">
                    <button
                      onClick={() => setInnerView("categories")}
                      className="w-10 h-10 bg-slate-900 border border-slate-800 hover:bg-slate-800 text-white rounded-xl flex items-center justify-center shadow-lg transition-all"
                    >
                      <ArrowLeft className="w-5 h-5" />
                    </button>
                    <h1 className="text-lg font-bold text-white tracking-wide truncate max-w-xs md:max-w-md">
                      {selectedCategory?.category_name || "Catálogo"}
                    </h1>
                  </div>
                  
                  {/* Search bar */}
                  <div className="ml-auto relative w-full md:w-80 shrink-0">
                    <Search className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
                    <input
                      type="text"
                      placeholder="Buscar conteúdo..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full bg-[#0d1527] border border-slate-800 focus:border-indigo-500 rounded-xl pl-9 pr-4 py-2 text-sm text-slate-200 focus:outline-none transition-all"
                    />
                  </div>
                </div>

                {/* Main grid scroll container */}
                <div className="flex-1 overflow-y-auto p-6 pt-2 pb-12">
                  {isDataFetching ? (
                    <div className="flex flex-col items-center justify-center text-slate-500 py-24">
                      <Loader2 className="w-10 h-10 animate-spin text-indigo-500 mb-2" />
                      <p className="text-xs font-bold uppercase tracking-widest">Carregando canais e mídias...</p>
                    </div>
                  ) : filteredItems.length === 0 ? (
                    <div className="flex flex-col items-center justify-center text-slate-500 py-24 text-center">
                      <Info className="w-12 h-12 text-slate-600 mb-2" />
                      <p className="text-sm font-semibold">Nenhum canal ou vídeo encontrado nesta seção.</p>
                    </div>
                  ) : currentFeature === "live" ? (
                    /* Live Grid View */
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                      {filteredItems.map((item) => (
                        <button
                          key={item.stream_id}
                          onClick={() => playContent(item)}
                          className="w-full flex items-center gap-4 bg-slate-900/40 border border-slate-800 hover:border-emerald-500/40 hover:bg-slate-900 p-4 rounded-2xl transition-all text-left group shadow-md"
                        >
                          <div className="w-12 h-12 flex items-center justify-center bg-black/40 rounded-xl p-1.5 shrink-0 border border-slate-800/50">
                            <img
                              src={item.stream_icon && item.stream_icon.startsWith("http") ? item.stream_icon : defaultPlaceholder}
                              alt=""
                              onError={(e) => {
                                (e.target as HTMLImageElement).src = defaultPlaceholder;
                              }}
                              className="max-h-full max-w-full object-contain rounded"
                            />
                          </div>
                          <div className="flex-grow overflow-hidden">
                            <p className="text-xs font-bold text-slate-200 truncate group-hover:text-white">
                              {item.name}
                            </p>
                            <p className="text-[9px] text-emerald-400 font-black tracking-widest mt-1 uppercase flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                              AO VIVO
                            </p>
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    /* VOD & Series Card Grid View */
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
                      {filteredItems.map((item) => {
                        const posterImg = item.stream_icon || item.cover || defaultPlaceholder;
                        return (
                          <button
                            key={item.stream_id || item.series_id}
                            onClick={() => handleSelectItem(item)}
                            className="group flex flex-col bg-[#0d1527] border border-slate-800/80 hover:border-indigo-500/40 rounded-2xl overflow-hidden text-left shadow-lg transition-all hover:scale-[1.02]"
                          >
                            <div className="w-full aspect-[2/3] bg-slate-950 flex items-center justify-center relative overflow-hidden shrink-0">
                              <img
                                src={posterImg.startsWith("http") ? posterImg : defaultPlaceholder}
                                alt=""
                                onError={(e) => {
                                  (e.target as HTMLImageElement).src = defaultPlaceholder;
                                }}
                                className="absolute inset-0 w-full h-full object-cover transition duration-300 group-hover:scale-105"
                              />
                              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-4">
                                <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider flex items-center gap-1.5">
                                  <Info className="w-3.5 h-3.5" /> Detalhes
                                </span>
                              </div>
                            </div>
                            <div className="p-3 flex flex-col justify-between flex-grow bg-[#0d1527] border-t border-slate-900">
                              <p className="text-xs font-bold text-slate-200 line-clamp-2 leading-snug">
                                {item.name}
                              </p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* SCREEN VIEW C: DETAILED INFO SCREEN (VOD & Series) */}
            {innerView === "details" && selectedItem && (
              <div className="flex-1 relative overflow-y-auto bg-[#050814]">
                {/* Ambient Blurred Backdrop for Cinematic Premium Look */}
                <div 
                  className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-20 blur-2xl transition-all duration-700 pointer-events-none"
                  style={{ backgroundImage: `url(${selectedItem.stream_icon || selectedItem.cover || defaultPlaceholder})` }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#050814] via-[#050814]/90 to-transparent pointer-events-none" />

                <div className="relative z-10 flex flex-col p-6 md:p-12 min-h-full">
                  <button
                    onClick={() => setInnerView("grid")}
                    className="w-10 h-10 bg-slate-900/80 border border-slate-800 hover:bg-slate-800 text-white rounded-xl flex items-center justify-center shadow-2xl backdrop-blur-md mb-8 hover:scale-105 transition"
                  >
                    <ArrowLeft className="w-5 h-5" />
                  </button>

                  <div className="flex flex-col md:flex-row gap-8 items-start mt-auto">
                    {/* Poster on left */}
                    <img
                      src={selectedItem.stream_icon || selectedItem.cover || defaultPlaceholder}
                      alt=""
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = defaultPlaceholder;
                      }}
                      className="w-48 md:w-64 rounded-2xl shadow-2xl border border-slate-800/50 shrink-0"
                    />

                    {/* Metadata on right */}
                    <div className="flex flex-col gap-4 text-white w-full">
                      <h1 className="text-3xl md:text-5xl font-black tracking-wide text-white drop-shadow">
                        {selectedItem.name}
                      </h1>

                      {/* Info Pills */}
                      <div className="flex flex-wrap items-center gap-3 text-xs font-bold text-indigo-400 uppercase tracking-wider drop-shadow-md">
                        <span className="bg-indigo-600/10 text-indigo-400 px-2.5 py-1 rounded-md border border-indigo-500/20">
                          {currentFeature === "movie" ? "FILME" : "SÉRIE"}
                        </span>
                        
                        {currentFeature === "movie" && movieDetail?.info && (
                          <>
                            {movieDetail.info.releasedate && (
                              <span className="flex items-center gap-1 text-slate-300">
                                <Calendar className="w-3.5 h-3.5" /> {movieDetail.info.releasedate}
                              </span>
                            )}
                            {movieDetail.info.rating && (
                              <span className="flex items-center gap-1 text-amber-400">
                                <Star className="w-3.5 h-3.5 fill-current" /> {movieDetail.info.rating}/10
                              </span>
                            )}
                            {movieDetail.info.director && (
                              <span className="flex items-center gap-1 text-slate-300">
                                <Video className="w-3.5 h-3.5" /> Dir: {movieDetail.info.director}
                              </span>
                            )}
                          </>
                        )}

                        {currentFeature === "series" && seriesDetail?.info && (
                          <>
                            {seriesDetail.info.releaseDate && (
                              <span className="flex items-center gap-1 text-slate-300">
                                <Calendar className="w-3.5 h-3.5" /> {seriesDetail.info.releaseDate}
                              </span>
                            )}
                            {seriesDetail.info.rating && (
                              <span className="flex items-center gap-1 text-amber-400">
                                <Star className="w-3.5 h-3.5 fill-current" /> {seriesDetail.info.rating}/10
                              </span>
                            )}
                            {seriesDetail.info.genre && (
                              <span className="text-slate-300">
                                {seriesDetail.info.genre}
                              </span>
                            )}
                          </>
                        )}
                      </div>

                      {/* Plot Description */}
                      <p className="text-slate-300 text-sm md:text-base leading-relaxed max-w-4xl drop-shadow-md">
                        {currentFeature === "movie" 
                          ? (movieDetail?.info?.description || "Sinopse não disponível.")
                          : (seriesDetail?.info?.plot || seriesDetail?.info?.description || "Sinopse não disponível.")
                        }
                      </p>

                      {/* Interactive Section */}
                      {isDataFetching ? (
                        <div className="mt-6 flex items-center gap-2 text-indigo-400 text-xs font-bold uppercase tracking-widest animate-pulse">
                          <Loader2 className="w-5 h-5 animate-spin" /> Carregando mídias do servidor...
                        </div>
                      ) : currentFeature === "movie" ? (
                        /* MOVIE WATCH BUTTON */
                        <div className="mt-6">
                          <button
                            onClick={() => playContent(selectedItem)}
                            className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3.5 px-8 rounded-xl shadow-[0_0_20px_rgba(99,102,241,0.4)] transition-all flex items-center justify-center gap-3 w-max"
                          >
                            <Play className="w-5 h-5 fill-current" />
                            <span>ASSISTIR AGORA</span>
                          </button>
                        </div>
                      ) : (
                        /* SERIES SEASON & EPISODES MANAGER */
                        seriesDetail?.episodes && Object.keys(seriesDetail.episodes).length > 0 ? (
                          <div className="mt-6 w-full max-w-4xl bg-slate-950/40 border border-slate-800/80 rounded-2xl overflow-hidden flex flex-col md:flex-row shadow-2xl h-80">
                            {/* Seasons List (Left) */}
                            <div className="w-full md:w-1/3 border-b md:border-b-0 md:border-r border-slate-800 bg-slate-900/30 overflow-y-auto p-2 flex md:flex-col gap-1 shrink-0">
                              {Object.keys(seriesDetail.episodes).map((seasonNum) => (
                                <button
                                  key={seasonNum}
                                  onClick={() => setSelectedSeason(seasonNum)}
                                  className={`w-full text-left px-4 py-3 rounded-xl text-xs font-bold transition-all shrink-0 ${
                                    selectedSeason === seasonNum
                                      ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/10"
                                      : "text-slate-400 hover:bg-slate-800/50 hover:text-white"
                                  }`}
                                >
                                  Temporada {seasonNum}
                                </button>
                              ))}
                            </div>

                            {/* Episodes List (Right) */}
                            <div className="w-full md:w-2/3 overflow-y-auto p-3 bg-slate-950/20 flex flex-col gap-1.5">
                              {seriesDetail.episodes[selectedSeason]?.map((ep) => (
                                <button
                                  key={ep.id}
                                  onClick={() => playEpisode(ep)}
                                  className="w-full text-left bg-slate-900/30 hover:bg-indigo-950/10 border border-slate-800 hover:border-slate-700 p-3.5 rounded-xl cursor-pointer flex items-center justify-between transition-all group"
                                >
                                  <div className="flex flex-col overflow-hidden pr-3">
                                    <span className="text-xs font-bold text-slate-200 group-hover:text-white truncate">
                                      Episódio {ep.episode_num}: {ep.title}
                                    </span>
                                    <span className="text-[9px] text-slate-500 font-semibold mt-0.5 uppercase tracking-wider">
                                      Reproduzir
                                    </span>
                                  </div>
                                  <div className="w-8 h-8 rounded-lg bg-slate-800/80 flex items-center justify-center text-slate-400 group-hover:bg-indigo-600 group-hover:text-white transition">
                                    <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                                  </div>
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <p className="text-xs text-slate-500 italic mt-6">Nenhum episódio encontrado para esta série.</p>
                        )
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>
      )}

    </div>
  );
}
