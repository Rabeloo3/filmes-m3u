import React, { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import mpegts from "mpegts.js";
import { Play, Pause, Volume2, VolumeX, Maximize, RotateCcw, FastForward, Loader2 } from "lucide-react";

interface HlsPlayerProps {
  url: string;
  onClose?: () => void;
}

export default function HlsPlayer({ url, onClose }: HlsPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Track URL dynamically to support format switching in player
  const [currentUrl, setCurrentUrl] = useState(url);
  const [hasError, setHasError] = useState<string | null>(null);
  const fallbackTriedRef = useRef(false);

  const [isPlaying, setIsPlaying] = useState(true);
  const [volume, setVolume] = useState(0.8);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [showControls, setShowControls] = useState(true);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Sync prop changes with player state
  useEffect(() => {
    setCurrentUrl(url);
    setHasError(null);
    fallbackTriedRef.current = false;
  }, [url]);

  // Extract parts of target URL to toggle live video stream formats dynamically (TS vs HLS)
  const getTargetUrlParts = () => {
    try {
      const decodedTarget = decodeURIComponent(currentUrl.split("?url=")[1] || currentUrl);
      const isLive = decodedTarget.includes("/live/");
      const isTs = decodedTarget.toLowerCase().endsWith(".ts") || decodedTarget.toLowerCase().includes(".ts?") || decodedTarget.toLowerCase().includes("/live/");
      const isM3u8 = decodedTarget.toLowerCase().includes(".m3u8") || decodedTarget.toLowerCase().includes("m3u8");
      return { decodedTarget, isLive, isTs, isM3u8 };
    } catch (e) {
      return { decodedTarget: currentUrl, isLive: false, isTs: false, isM3u8: false };
    }
  };

  const toggleLiveFormat = () => {
    const { decodedTarget, isTs } = getTargetUrlParts();
    let newTarget = decodedTarget;
    
    // Toggle extension
    if (isTs) {
      newTarget = decodedTarget.replace(/\.ts(\?|$)/i, ".m3u8$1");
    } else {
      newTarget = decodedTarget.replace(/\.m3u8(\?|$)/i, ".ts$1");
    }

    const newProxied = currentUrl.includes("?url=")
      ? `/api/stream?url=${encodeURIComponent(newTarget)}`
      : newTarget;

    fallbackTriedRef.current = false; // Reset fallback check when user manually toggles
    setCurrentUrl(newProxied);
    setHasError(null);
    setIsLoading(true);
  };

  // Initialize HLS, MPEG-TS, or native playback
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    setIsLoading(true);
    setHasError(null);
    let hls: Hls | null = null;
    let mpegtsPlayer: any = null;

    // Check if the source stream is HLS (manifest playlist)
    const decodedUrl = decodeURIComponent(currentUrl);
    const isHls = decodedUrl.toLowerCase().includes(".m3u8") || 
                  decodedUrl.toLowerCase().includes("m3u8") || 
                  decodedUrl.toLowerCase().includes("type=m3u8");

    const isTs = decodedUrl.toLowerCase().includes(".ts") || 
                 decodedUrl.toLowerCase().includes("type=ts") ||
                 decodedUrl.includes("/live/");

    const { decodedTarget, isLive, isTs: targetIsTs } = getTargetUrlParts();

    // Track whether playback has successfully started
    let playbackStarted = false;

    const handlePlaybackError = (defaultErrorMsg: string) => {
      if (isLive && !fallbackTriedRef.current) {
        fallbackTriedRef.current = true;
        console.log(`Automatic fallback triggered. Switching from ${targetIsTs ? "TS" : "HLS"} to alternative format.`);
        
        let newTarget = decodedTarget;
        if (targetIsTs) {
          newTarget = decodedTarget.replace(/\.ts(\?|$)/i, ".m3u8$1");
        } else {
          newTarget = decodedTarget.replace(/\.m3u8(\?|$)/i, ".ts$1");
        }

        const newProxied = currentUrl.includes("?url=")
          ? `/api/stream?url=${encodeURIComponent(newTarget)}`
          : newTarget;

        setCurrentUrl(newProxied);
        setHasError(null);
        setIsLoading(true);
      } else {
        setHasError(defaultErrorMsg);
        setIsLoading(false);
      }
    };

    // Connection timeout fallback: if after 20 seconds of loading we haven't played anything, trigger fallback
    const loadingTimeout = setTimeout(() => {
      if (!playbackStarted) {
        console.log("Loading taking too long. Attempting format fallback...");
        handlePlaybackError("A transmissão está demorando muito para carregar. Tentando alternar formato...");
      }
    }, 20000);

    const onPlaying = () => {
      playbackStarted = true;
      setIsLoading(false);
    };

    const onWaiting = () => {
      if (playbackStarted) {
        setIsLoading(true);
      }
    };

    video.addEventListener("playing", onPlaying);
    video.addEventListener("waiting", onWaiting);

    if (isHls && Hls.isSupported()) {
      hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 90,
      });
      hls.loadSource(currentUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play()
          .then(() => {
            setIsPlaying(true);
            playbackStarted = true;
          })
          .catch(() => setIsPlaying(false));
        setIsLoading(false);
      });
      hls.on(Hls.Events.ERROR, (event, data) => {
        console.warn("HLS error:", data);
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              hls?.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              hls?.recoverMediaError();
              break;
            default:
              handlePlaybackError("Erro crítico ao carregar a transmissão HLS (M3U8). Verifique se o stream está online.");
              break;
          }
        }
      });
    } else if (isTs && mpegts.isSupported()) {
      try {
        mpegtsPlayer = mpegts.createPlayer({
          type: "mpegts",
          isLive: true,
          url: currentUrl,
        }, {
          enableWorker: true,
          lazyLoad: false,
          stashInitialSize: 128 * 1024, // 128KB buffer size
        });
        
        mpegtsPlayer.attachMediaElement(video);
        mpegtsPlayer.load();
        
        const playPromise = video.play();
        if (playPromise !== undefined) {
          playPromise
            .then(() => {
              setIsPlaying(true);
              playbackStarted = true;
            })
            .catch((e) => {
              console.warn("Auto-play blocked or failed:", e);
              setIsPlaying(false);
            });
        }
        
        setIsLoading(false);

        mpegtsPlayer.on(mpegts.Events.ERROR, (type: any, detail: any, info: any) => {
          console.error("mpegts playback error:", type, detail, info);
          handlePlaybackError("Este canal (formato TS) falhou ao ser decodificado ou não está disponível.");
        });
      } catch (err: any) {
        console.error("Mpegts initialization failure:", err);
        handlePlaybackError("Falha ao inicializar o decodificador de transmissão TS.");
      }
    } else {
      // Native VOD playback (Safari HLS, or direct MP4/MKV streams)
      video.src = currentUrl;
      
      const onLoadedMetadata = () => {
        video.play()
          .then(() => {
            setIsPlaying(true);
            playbackStarted = true;
          })
          .catch(() => setIsPlaying(false));
        setIsLoading(false);
      };

      const onError = (e: Event) => {
        const err = video.error;
        let errMsg = "O navegador não suporta este formato de vídeo diretamente, ou o codec (como HEVC/H.265 ou áudio AC3) não é suportado pelo seu navegador.";
        if (err) {
          errMsg += ` (Erro ${err.code}: ${err.message || "Codec ou formato incompatível"})`;
        }
        console.error("Native video element playback error:", err);
        handlePlaybackError(errMsg);
      };

      video.addEventListener("loadedmetadata", onLoadedMetadata);
      video.addEventListener("error", onError);

      // Clean up native listeners
      return () => {
        clearTimeout(loadingTimeout);
        video.removeEventListener("loadedmetadata", onLoadedMetadata);
        video.removeEventListener("error", onError);
        video.removeEventListener("playing", onPlaying);
        video.removeEventListener("waiting", onWaiting);
      };
    }

    return () => {
      clearTimeout(loadingTimeout);
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("waiting", onWaiting);
      if (hls) {
        hls.destroy();
      }
      if (mpegtsPlayer) {
        mpegtsPlayer.unload();
        mpegtsPlayer.detachMediaElement();
        mpegtsPlayer.destroy();
      }
    };
  }, [currentUrl]);

  // Handle auto-hiding controls on mouse inactivity
  const triggerShowControls = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlaying) {
        setShowControls(false);
      }
    }, 3000);
  };

  useEffect(() => {
    triggerShowControls();
    return () => {
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
    };
  }, [isPlaying]);

  const handlePlayPause = () => {
    const video = videoRef.current;
    if (!video) return;
    if (isPlaying) {
      video.pause();
      setIsPlaying(false);
    } else {
      video.play().catch(() => {});
      setIsPlaying(true);
    }
    triggerShowControls();
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVol = parseFloat(e.target.value);
    setVolume(newVol);
    const video = videoRef.current;
    if (video) {
      video.volume = newVol;
      video.muted = newVol === 0;
      setIsMuted(newVol === 0);
    }
    triggerShowControls();
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    const nextMute = !isMuted;
    setIsMuted(nextMute);
    video.muted = nextMute;
    triggerShowControls();
  };

  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (!video) return;
    setCurrentTime(video.currentTime);
  };

  const handleDurationChange = () => {
    const video = videoRef.current;
    if (!video) return;
    setDuration(video.duration || 0);
  };

  const handleSeekChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const targetTime = parseFloat(e.target.value);
    const video = videoRef.current;
    if (video) {
      video.currentTime = targetTime;
      setCurrentTime(targetTime);
    }
    triggerShowControls();
  };

  const seekForward = () => {
    const video = videoRef.current;
    if (video) {
      video.currentTime = Math.min(video.duration || 0, video.currentTime + 10);
    }
    triggerShowControls();
  };

  const seekBackward = () => {
    const video = videoRef.current;
    if (video) {
      video.currentTime = Math.max(0, video.currentTime - 10);
    }
    triggerShowControls();
  };

  const toggleFullscreen = () => {
    const container = containerRef.current;
    if (!container) return;
    if (!document.fullscreenElement) {
      container.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
    triggerShowControls();
  };

  const formatTime = (timeInSeconds: number) => {
    if (isNaN(timeInSeconds) || !isFinite(timeInSeconds)) return "00:00";
    const hours = Math.floor(timeInSeconds / 3600);
    const minutes = Math.floor((timeInSeconds % 3600) / 60);
    const seconds = Math.floor(timeInSeconds % 60);

    const pad = (n: number) => String(n).padStart(2, "0");
    if (hours > 0) {
      return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
    }
    return `${pad(minutes)}:${pad(seconds)}`;
  };

  return (
    <div
      ref={containerRef}
      onMouseMove={triggerShowControls}
      onClick={triggerShowControls}
      className="relative w-full h-full bg-black flex items-center justify-center overflow-hidden group select-none"
    >
      {/* Video Element */}
      <video
        ref={videoRef}
        className="w-full h-full max-h-screen object-contain"
        onTimeUpdate={handleTimeUpdate}
        onDurationChange={handleDurationChange}
        onPlaying={() => {
          setIsPlaying(true);
          setIsLoading(false);
        }}
        onWaiting={() => setIsLoading(true)}
        onClick={(e) => {
          e.stopPropagation();
          handlePlayPause();
        }}
      />

      {/* Loading Overlay */}
      {isLoading && !hasError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm z-30 pointer-events-none">
          <Loader2 className="w-12 h-12 text-indigo-500 animate-spin mb-3" />
          <p className="text-xs font-bold text-slate-300 uppercase tracking-widest animate-pulse">
            Carregando transmissão...
          </p>
        </div>
      )}

      {/* Error Overlay */}
      {hasError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/95 p-6 text-center z-40">
          <div className="w-16 h-16 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center mb-4 border border-red-500/20">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h3 className="text-lg font-bold text-white mb-2">Erro de Reprodução</h3>
          <p className="text-sm text-slate-400 max-w-md mb-6 leading-relaxed">
            {hasError}
            <br />
            <span className="text-xs text-slate-500 mt-2 block">
              Alguns canais ao vivo exigem o protocolo TS em vez de HLS (ou vice-versa). Tente alternar o protocolo abaixo para resolver.
            </span>
          </p>
          <div className="flex flex-col sm:flex-row gap-3 z-50">
            {getTargetUrlParts().isLive && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleLiveFormat();
                }}
                className="bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded-xl text-xs font-bold transition shadow-lg shadow-indigo-600/35"
              >
                Alternar para {getTargetUrlParts().isTs ? "HLS (M3U8)" : "TS"}
              </button>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (onClose) onClose();
              }}
              className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-5 py-2.5 rounded-xl text-xs font-bold transition border border-slate-700"
            >
              Voltar ao Menu
            </button>
          </div>
        </div>
      )}

      {/* Top Controls Bar - Always visible if controls are shown */}
      <div
        className={`absolute top-0 inset-x-0 bg-gradient-to-b from-black/80 via-black/40 to-transparent p-6 flex items-center justify-between z-40 transition-opacity duration-300 ${
          showControls ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (onClose) onClose();
          }}
          className="flex items-center gap-2 bg-slate-900/80 hover:bg-red-600 hover:text-white border border-slate-700 hover:border-red-500 px-4 py-2 rounded-xl text-xs font-bold text-slate-200 transition shadow-lg backdrop-blur"
        >
          &larr; Voltar ao Menu
        </button>
        <div className="flex items-center gap-2">
          {getTargetUrlParts().isLive && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleLiveFormat();
              }}
              className="bg-slate-900/80 hover:bg-indigo-600 hover:text-white border border-slate-700 hover:border-indigo-500 px-3 py-1.5 rounded-xl text-xs font-bold text-indigo-400 transition shadow-lg backdrop-blur"
              title="Clique para alternar entre formatos TS e M3U8"
            >
              Protocolo: <span className="underline">{getTargetUrlParts().isTs ? "TS" : "HLS"}</span>
            </button>
          )}
          <div className="text-xs font-bold bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 px-3 py-1.5 rounded-full uppercase tracking-widest backdrop-blur">
            Transmissão Digital
          </div>
        </div>
      </div>

      {/* Center Big Play Button (Hidden when playing) */}
      {!isPlaying && !isLoading && !hasError && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            handlePlayPause();
          }}
          className="absolute w-20 h-20 bg-indigo-600/90 text-white rounded-full flex items-center justify-center hover:scale-110 active:scale-95 transition shadow-[0_0_30px_rgba(99,102,241,0.5)] z-40"
        >
          <Play className="w-10 h-10 fill-current ml-1" />
        </button>
      )}

      {/* Bottom Controls Bar */}
      <div
        className={`absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-6 pt-12 flex flex-col gap-4 z-40 transition-opacity duration-300 ${
          showControls ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Progress Slider (Only show for VOD/Series i.e. when duration is finite and > 0) */}
        {duration > 0 && !isNaN(duration) && isFinite(duration) && (
          <div className="flex items-center gap-3 w-full">
            <span className="text-xs font-mono text-slate-300 shrink-0">
              {formatTime(currentTime)}
            </span>
            <input
              type="range"
              min={0}
              max={duration || 100}
              value={currentTime}
              onChange={handleSeekChange}
              className="w-full accent-indigo-500 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer hover:bg-slate-700 transition"
            />
            <span className="text-xs font-mono text-slate-300 shrink-0">
              {formatTime(duration)}
            </span>
          </div>
        )}

        {/* Buttons Row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={handlePlayPause}
              className="w-10 h-10 rounded-xl bg-slate-800/80 hover:bg-indigo-600 text-white flex items-center justify-center transition"
              title={isPlaying ? "Pausar" : "Reproduzir"}
            >
              {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 fill-current" />}
            </button>

            {duration > 0 && (
              <>
                <button
                  onClick={seekBackward}
                  className="w-10 h-10 rounded-xl bg-slate-800/80 hover:bg-indigo-600 text-white flex items-center justify-center transition"
                  title="-10 Segundos"
                >
                  <RotateCcw className="w-5 h-5" />
                </button>
                <button
                  onClick={seekForward}
                  className="w-10 h-10 rounded-xl bg-slate-800/80 hover:bg-indigo-600 text-white flex items-center justify-center transition"
                  title="+10 Segundos"
                >
                  <FastForward className="w-5 h-5" />
                </button>
              </>
            )}

            {/* Volume controls */}
            <div className="flex items-center gap-2 bg-slate-800/80 rounded-xl px-3 h-10 border border-slate-700/50 ml-2">
              <button onClick={toggleMute} className="text-slate-200 hover:text-white">
                {isMuted ? <VolumeX className="w-5 h-5 text-red-400" /> : <Volume2 className="w-5 h-5" />}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                className="w-20 accent-indigo-500 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={toggleFullscreen}
              className="w-10 h-10 rounded-xl bg-slate-800/80 hover:bg-indigo-600 text-white flex items-center justify-center transition"
              title="Tela Cheia"
            >
              <Maximize className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
