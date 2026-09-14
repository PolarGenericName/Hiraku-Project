import { useRef, useState, useEffect, useCallback } from 'react';
import Hls from 'hls.js';
import {
  X, Play, Pause, Volume2, VolumeX, Volume1,
  Maximize, Minimize, Settings, SkipForward, SkipBack,
  Languages, Gauge, Zap
} from 'lucide-react';
import type { EpisodeStream } from '@/providers/types';
import { saveEpisodeProgress, getResumeTime } from '@/shared/lib/watchProgress';
import { useAccount } from '@/contexts/AccountContext';

interface VideoPlayerProps {
  stream: EpisodeStream;
  animeId: string;
  animeTitle?: string;
  animeCover?: string;
  animeGenres?: string[];
  animeYear?: number;
  onClose: () => void;
  onNextEpisode?: () => void;
}

const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2];

export default function VideoPlayer({ stream, animeId, animeTitle, animeCover, animeGenres, animeYear, onClose, onNextEpisode }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const hideControlsTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const volumeHoverTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const { addToHistory } = useAccount();

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [showLanguages, setShowLanguages] = useState(false);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [showQualityMenu, setShowQualityMenu] = useState(false);
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);
  const [selectedAudio, setSelectedAudio] = useState<'dublado' | 'legendado'>('legendado');
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isBuffering, setIsBuffering] = useState(true);
  const [qualities, setQualities] = useState<any[]>([]);
  const [selectedQuality, setSelectedQuality] = useState<number>(-1);

  const dubStream = stream.streams.find(s => s.audio === 'dublado');
  const legStream = stream.streams.find(s => s.audio === 'legendado');
  const currentStream = (selectedAudio === 'dublado' ? dubStream : legStream) || dubStream || legStream || stream.streams[0];

  if (!currentStream) {
    return (
      <div className="fixed inset-0 z-[100] bg-black flex items-center justify-center">
        <div className="text-center">
          <p className="text-white text-lg mb-4">Nenhuma stream disponível</p>
          <button onClick={onClose} className="px-4 py-2 bg-white/10 rounded-lg text-white hover:bg-white/20">
            Fechar
          </button>
        </div>
      </div>
    );
  }

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !currentStream) return;

    // Cleanup previous instance
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    setIsBuffering(true);
    setQualities([]);
    setSelectedQuality(-1);

    // The stream URL is an HLS manifest disguised as .jpg
    // e.g. https://akumast.net/i/.../h.jpg -> /stream/i/.../h.jpg
    const proxyUrl = currentStream.url.replace('https://akumast.net', '/stream');

    let lastSaveTime = 0;

    const buildDiscordPayload = (playing: boolean) => {
      const genreText = animeGenres && animeGenres.length > 0 ? animeGenres.slice(0, 2).join(' • ') : '';
      const yearText = animeYear ? String(animeYear) : '';
      const metaText = [genreText, yearText].filter(Boolean).join(' • ');
      const episodeLabel = `T${stream.season} E${stream.number}`;
      const episodeName = stream.title ? ` — ${stream.title}` : '';
      const payload: any = {
        details: animeTitle || stream.title || '',
        state: `${episodeLabel}${episodeName}`,
        largeImageKey: animeCover || 'hiraku',
        largeImageText: metaText || 'Hiraku',
        smallImageKey: 'hiraku',
        smallImageText: playing ? 'Hiraku' : 'Pausado',
        type: 3,
      };
      if (playing && video.duration > 0) {
        payload.startTimestamp = Date.now() - video.currentTime * 1000;
        payload.endTimestamp = Date.now() + (video.duration - video.currentTime) * 1000;
      }
      return payload;
    };

    const onPlay = () => {
      setIsPlaying(true);
      setIsBuffering(false);
      addToHistory({
        animeId,
        animeTitle: animeTitle || stream.title || '',
        animeCover: animeCover || '',
        episodeId: stream.episodeId,
        episodeNumber: stream.number,
        season: stream.season,
        watchedAt: Date.now(),
      });
      window.electronAPI?.setActivity(buildDiscordPayload(true));
    };
    const onPause = () => {
      setIsPlaying(false);
      if (video.currentTime > 0 && video.duration > 0) {
        saveEpisodeProgress(animeId, stream.episodeId, stream.number, stream.season, video.currentTime, video.duration);
      }
      window.electronAPI?.setActivity(buildDiscordPayload(false));
    };
    const onTimeUpdate = () => {
      setCurrentTime(video.currentTime);
      if (video.currentTime - lastSaveTime >= 5 && video.duration > 0) {
        lastSaveTime = video.currentTime;
        saveEpisodeProgress(animeId, stream.episodeId, stream.number, stream.season, video.currentTime, video.duration);
      }
    };
    const onLoadedMetadata = () => {
      setDuration(video.duration);
      const resumeTime = getResumeTime(animeId, stream.episodeId);
      if (resumeTime > 0 && video.currentTime === 0) {
        video.currentTime = resumeTime;
      }
      if (video.duration > 0) {
        window.electronAPI?.setActivity(buildDiscordPayload(true));
      }
    };
    const onWaiting = () => setIsBuffering(true);
    const onCanPlay = () => setIsBuffering(false);
    const onEnded = () => {
      setIsPlaying(false);
      if (video.duration > 0) {
        saveEpisodeProgress(animeId, stream.episodeId, stream.number, stream.season, video.duration, video.duration);
      }
      window.electronAPI?.clearActivity();
    };

    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('loadedmetadata', onLoadedMetadata);
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('canplay', onCanPlay);
    video.addEventListener('ended', onEnded);

    // Initialize HLS.js
    if (Hls.isSupported()) {
      const hls = new Hls({
        startLevel: -1, // auto
        capLevelToPlayerSize: true,
      });
      hlsRef.current = hls;

      hls.loadSource(proxyUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, (_event, data) => {
        const levels = data.levels.map((l, i) => ({
          height: l.height,
          width: l.width,
          bitrate: l.bitrate,
          levelIndex: i,
        }));
        setQualities(levels);
        // Start at highest quality
        if (levels.length > 0) {
          const highest = levels.length - 1;
          hls.currentLevel = highest;
          setSelectedQuality(highest);
        }
        video.play().catch(() => {});
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          console.error('[Player] HLS fatal error:', data.type, data.details);
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            hls.startLoad();
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            hls.recoverMediaError();
          }
        }
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Safari native HLS
      video.src = proxyUrl;
      video.addEventListener('loadedmetadata', () => {
        video.play().catch(() => {});
      });
    }

    return () => {
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('canplay', onCanPlay);
      video.removeEventListener('ended', onEnded);
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      window.electronAPI?.clearActivity();
    };
  }, [selectedAudio, currentStream?.url]);

  useEffect(() => {
    const video = videoRef.current;
    if (video) video.playbackRate = playbackRate;
  }, [playbackRate]);

  useEffect(() => {
    const hls = hlsRef.current;
    if (hls && selectedQuality >= 0) {
      hls.currentLevel = selectedQuality;
    }
  }, [selectedQuality]);

  const resetHideTimer = useCallback(() => {
    setShowControls(true);
    if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current);
    hideControlsTimer.current = setTimeout(() => {
      if (isPlaying) setShowControls(false);
      setShowSettings(false);
      setShowLanguages(false);
      setShowSpeedMenu(false);
      setShowQualityMenu(false);
      setShowVolumeSlider(false);
    }, 3000);
  }, [isPlaying]);

  useEffect(() => {
    if (isPlaying) resetHideTimer();
    else setShowControls(true);
    return () => { if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current); };
  }, [isPlaying, resetHideTimer]);

  const saveCurrentProgress = useCallback(() => {
    const video = videoRef.current;
    if (video && video.currentTime > 0 && video.duration > 0) {
      saveEpisodeProgress(animeId, stream.episodeId, stream.number, stream.season, video.currentTime, video.duration);
    }
  }, [animeId, stream]);

  const handleClose = useCallback(() => {
    saveCurrentProgress();
    onClose();
  }, [saveCurrentProgress, onClose]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showSettings) setShowSettings(false);
        else if (showLanguages) setShowLanguages(false);
        else if (showSpeedMenu) setShowSpeedMenu(false);
        else if (showQualityMenu) setShowQualityMenu(false);
        else handleClose();
      }
      if (e.key === ' ' || e.key === 'k') { e.preventDefault(); togglePlay(); }
      if (e.key === 'f') toggleFullscreen();
      if (e.key === 'ArrowLeft') skip(-10);
      if (e.key === 'ArrowRight') skip(10);
      if (e.key === 'ArrowUp') { e.preventDefault(); adjustVolume(0.1); }
      if (e.key === 'ArrowDown') { e.preventDefault(); adjustVolume(-0.1); }
      if (e.key === 'm') toggleMute();
      resetHideTimer();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [showSettings, showLanguages, showSpeedMenu, showQualityMenu, onClose, resetHideTimer]);

  const toggleFullscreen = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
      setIsFullscreen(false);
    } else {
      container.requestFullscreen();
      setIsFullscreen(true);
    }
  }, []);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) video.play();
    else video.pause();
  }, []);

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const video = videoRef.current;
    const bar = progressRef.current;
    if (!video || !bar) return;
    const rect = bar.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    video.currentTime = percent * duration;
  };

  const skip = (seconds: number) => {
    const video = videoRef.current;
    if (video) video.currentTime = Math.max(0, Math.min(video.duration, video.currentTime + seconds));
  };

  const adjustVolume = (delta: number) => {
    const video = videoRef.current;
    if (video) {
      video.volume = Math.max(0, Math.min(1, video.volume + delta));
      setVolume(video.volume);
      setIsMuted(video.volume === 0);
    }
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (video) {
      video.muted = !video.muted;
      setIsMuted(video.muted);
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    if (video) {
      const val = parseFloat(e.target.value);
      video.volume = val;
      setVolume(val);
      setIsMuted(val === 0);
    }
  };

  const getQualityLabel = (index: number) => {
    if (index === -1) return 'Auto';
    const q = qualities[index];
    if (!q) return `${index}`;
    if (q.height) return `${q.height}p`;
    if ((q as any).bitrate) return `${Math.round((q as any).bitrate / 1000)}kbps`;
    return `Q${index}`;
  };

  const streamQualities = currentStream?.qualities
    ? currentStream.qualities.split(/\s+/).filter(Boolean)
    : [];

  const getVolumeIcon = () => {
    if (isMuted || volume === 0) return <VolumeX size={20} />;
    if (volume < 0.5) return <Volume1 size={20} />;
    return <Volume2 size={20} />;
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  const handleVideoClick = useCallback(() => {
    if (showControls) {
      // If controls are showing, hide them and play/pause
      setShowControls(false);
      if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current);
    } else {
      // If controls are hidden, show them and start hide timer
      resetHideTimer();
    }
    togglePlay();
  }, [showControls, resetHideTimer, togglePlay]);

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[300] bg-black flex items-center justify-center"
      onMouseMove={resetHideTimer}
    >
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        onClick={handleVideoClick}
        playsInline
      />

      {/* Buffering spinner */}
      {isBuffering && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
          <div className="player-loader" />
        </div>
      )}

      {/* Controls overlay */}
      <div
        className={`absolute inset-0 transition-opacity duration-300 z-20 ${
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        style={{ background: 'linear-gradient(transparent 0%, transparent 50%, rgba(0,0,0,0.85) 100%)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top bar */}
        <div className="absolute top-0 left-0 right-0 p-5 flex items-start justify-between">
          <button
            onClick={handleClose}
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-all duration-200 text-white hover:scale-110"
          >
            <X size={22} />
          </button>

          <div className="flex items-center gap-2">
            {/* Settings */}
            <div className="relative">
              <button
                onClick={() => {
                  const next = !showSettings;
                  setShowSettings(next);
                  setShowLanguages(false);
                  setShowSpeedMenu(false);
                  setShowQualityMenu(false);
                }}
                className={`p-2 rounded-full transition-all duration-200 hover:scale-110 ${
                  showSettings ? 'bg-accent text-white' : 'bg-white/10 hover:bg-white/20 text-white'
                }`}
              >
                <Settings size={20} />
              </button>

              {showSettings && !showSpeedMenu && !showQualityMenu && (
                <div className="absolute right-0 top-full mt-3 bg-card/95 backdrop-blur-md border border-border rounded-xl shadow-2xl py-2 min-w-[200px] animate-in fade-in slide-in-from-top-2 duration-200">
                  <button
                    onClick={() => { setShowQualityMenu(true); setShowSettings(false); }}
                    className="w-full flex items-center justify-between px-4 py-3 text-sm text-foreground hover:bg-muted/50 transition-colors rounded-lg mx-1"
                    style={{ width: 'calc(100% - 8px)' }}
                  >
                    <span className="flex items-center gap-2"><Zap size={14} /> Qualidade</span>
                    <span className="text-accent font-semibold">{getQualityLabel(selectedQuality)}</span>
                  </button>
                  <button
                    onClick={() => { setShowSpeedMenu(true); setShowSettings(false); }}
                    className="w-full flex items-center justify-between px-4 py-3 text-sm text-foreground hover:bg-muted/50 transition-colors rounded-lg mx-1"
                    style={{ width: 'calc(100% - 8px)' }}
                  >
                    <span className="flex items-center gap-2"><Gauge size={14} /> Velocidade</span>
                    <span className="text-accent font-semibold">{playbackRate === 1 ? 'Normal' : `${playbackRate}x`}</span>
                  </button>
                </div>
              )}

              {showQualityMenu && (
                <div className="absolute right-0 top-full mt-3 bg-card/95 backdrop-blur-md border border-border rounded-xl shadow-2xl py-2 min-w-[180px] animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="px-4 py-2 text-xs text-muted-foreground uppercase tracking-wider font-semibold">Qualidade</div>
                  <button
                    onClick={() => { setSelectedQuality(-1); setShowQualityMenu(false); setShowSettings(false); }}
                    className={`w-full text-left px-4 py-2.5 text-sm transition-colors rounded-lg mx-1 ${
                      selectedQuality === -1 ? 'bg-accent text-white font-medium' : 'text-foreground hover:bg-muted/50'
                    }`}
                    style={{ width: 'calc(100% - 8px)' }}
                  >
                    Automático
                  </button>
                  {qualities.map((q, i) => (
                    <button
                      key={i}
                      onClick={() => { setSelectedQuality(i); setShowQualityMenu(false); setShowSettings(false); }}
                      className={`w-full text-left px-4 py-2.5 text-sm transition-colors rounded-lg mx-1 ${
                        selectedQuality === i ? 'bg-accent text-white font-medium' : 'text-foreground hover:bg-muted/50'
                      }`}
                      style={{ width: 'calc(100% - 8px)' }}
                    >
                      {q.height ? `${q.height}p` : `Quality ${i}`}
                      {q.bitrate ? <span className="text-xs opacity-60 ml-2">({Math.round(q.bitrate / 1000)}kbps)</span> : null}
                    </button>
                  ))}
                  {qualities.length === 0 && streamQualities.length > 0 && streamQualities.map((q, i) => (
                    <div key={i} className="px-4 py-2.5 text-sm text-muted-foreground">{q}</div>
                  ))}
                  {qualities.length === 0 && streamQualities.length === 0 && (
                    <div className="px-4 py-2 text-sm text-muted-foreground">Indisponível</div>
                  )}
                </div>
              )}

              {showSpeedMenu && (
                <div className="absolute right-0 top-full mt-3 bg-card/95 backdrop-blur-md border border-border rounded-xl shadow-2xl py-2 min-w-[160px] animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="px-4 py-2 text-xs text-muted-foreground uppercase tracking-wider font-semibold">Velocidade</div>
                  {SPEED_OPTIONS.map((speed) => (
                    <button
                      key={speed}
                      onClick={() => { setPlaybackRate(speed); setShowSpeedMenu(false); setShowSettings(false); }}
                      className={`w-full text-left px-4 py-2.5 text-sm transition-colors rounded-lg mx-1 ${
                        playbackRate === speed ? 'bg-accent text-white font-medium' : 'text-foreground hover:bg-muted/50'
                      }`}
                      style={{ width: 'calc(100% - 8px)' }}
                    >
                      {speed === 1 ? 'Normal' : `${speed}x`}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={toggleFullscreen}
              className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-all duration-200 text-white hover:scale-110"
            >
              {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
            </button>
          </div>
        </div>

        {/* Bottom controls */}
        <div className="absolute bottom-0 left-0 right-0 px-5 pb-4 pt-12">
          {/* Progress bar */}
          <div className="flex items-center gap-3 mb-3">
            <span className="text-white/80 text-xs font-mono min-w-[40px] tabular-nums">{formatTime(currentTime)}</span>
            <div
              ref={progressRef}
              className="flex-1 h-1.5 bg-white/20 rounded-full cursor-pointer group relative"
              onClick={handleProgressClick}
            >
              <div
                className="absolute inset-y-0 left-0 bg-accent rounded-full transition-all"
                style={{ width: `${progressPercent}%` }}
              />
              <div
                className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-accent rounded-full opacity-0 group-hover:opacity-100 transition-all duration-200 shadow-lg shadow-accent/50"
                style={{ left: `calc(${progressPercent}% - 7px)` }}
              />
            </div>
            <span className="text-white/80 text-xs font-mono min-w-[40px] text-right tabular-nums">{formatTime(duration)}</span>
          </div>

          {/* Center controls row */}
          <div className="flex items-center justify-center gap-4 mb-3">
            {/* Skip back */}
            <button
              onClick={() => skip(-10)}
              className="flex items-center gap-1 p-2.5 rounded-full bg-white/10 hover:bg-white/20 transition-all duration-200 text-white hover:scale-110"
            >
              <SkipBack size={18} />
              <span className="text-[11px] font-bold">10</span>
            </button>

            {/* Play/Pause */}
            <button
              onClick={togglePlay}
              className={`p-2 rounded-lg transition-all duration-200 hover:scale-110 ${
                isPlaying 
                  ? 'text-white hover:text-purple-400' 
                  : 'text-purple-500 hover:text-purple-400'
              }`}
            >
              {isPlaying ? <Pause size={28} /> : <Play size={28} className="ml-0.5" />}
            </button>

            {/* Skip forward */}
            <button
              onClick={() => skip(10)}
              className="flex items-center gap-1 p-2.5 rounded-full bg-white/10 hover:bg-white/20 transition-all duration-200 text-white hover:scale-110"
            >
              <span className="text-[11px] font-bold">10</span>
              <SkipForward size={18} />
            </button>
          </div>

          {/* Bottom row */}
          <div className="flex items-center justify-between">
            {/* Left: language + volume */}
            <div className="flex items-center gap-2">
              {(dubStream || legStream) && (
                <div className="relative">
                  <button
                    onClick={() => {
                      setShowLanguages(!showLanguages);
                      setShowSettings(false);
                      setShowSpeedMenu(false);
                      setShowQualityMenu(false);
                    }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-200 ${
                      showLanguages ? 'bg-accent text-white' : 'bg-white/10 hover:bg-white/20 text-white'
                    }`}
                  >
                    <Languages size={15} />
                    <span>Idiomas</span>
                  </button>

                  {showLanguages && (
                    <div className="absolute bottom-full mb-3 left-0 bg-card/95 backdrop-blur-md border border-border rounded-xl shadow-2xl py-2 min-w-[150px] animate-in fade-in slide-in-from-bottom-2 duration-200">
                      {dubStream && (
                        <button
                          onClick={() => { setSelectedAudio('dublado'); setShowLanguages(false); }}
                          className={`w-full text-left px-4 py-2.5 text-sm transition-colors rounded-lg mx-1 ${
                            selectedAudio === 'dublado' ? 'bg-accent text-white font-medium' : 'text-foreground hover:bg-muted/50'
                          }`}
                          style={{ width: 'calc(100% - 8px)' }}
                        >
                          Dublado
                        </button>
                      )}
                      {legStream && (
                        <button
                          onClick={() => { setSelectedAudio('legendado'); setShowLanguages(false); }}
                          className={`w-full text-left px-4 py-2.5 text-sm transition-colors rounded-lg mx-1 ${
                            selectedAudio === 'legendado' ? 'bg-accent text-white font-medium' : 'text-foreground hover:bg-muted/50'
                          }`}
                          style={{ width: 'calc(100% - 8px)' }}
                        >
                          Legendado
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Volume: icon + hover slider */}
              <div
                className="flex items-center gap-1.5"
                onMouseEnter={() => {
                  clearTimeout(volumeHoverTimer.current);
                  setShowVolumeSlider(true);
                }}
                onMouseLeave={() => {
                  volumeHoverTimer.current = setTimeout(() => setShowVolumeSlider(false), 300);
                }}
              >
                <button
                  onClick={toggleMute}
                  className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-all duration-200 text-white hover:scale-110"
                >
                  {getVolumeIcon()}
                </button>
                <div
                  className={`overflow-hidden transition-all duration-300 ease-out ${
                    showVolumeSlider ? 'w-24 opacity-100' : 'w-0 opacity-0'
                  }`}
                >
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={isMuted ? 0 : volume}
                    onChange={handleVolumeChange}
                    className="w-24 h-1 accent-accent cursor-pointer"
                  />
                </div>
              </div>
            </div>

            {/* Right: info + next episode */}
            <div className="flex items-center gap-3">
              <div className="text-right text-white">
                <p className="text-sm font-semibold opacity-90">EP {stream.number}: {stream.title}</p>
              </div>

              {stream.nextEpisode && (
                <button
                  onClick={onNextEpisode}
                  className="flex items-center gap-2 px-4 py-2 rounded-full bg-transparent hover:bg-accent border border-white/20 hover:border-accent transition-all duration-200 text-white text-sm font-medium hover:text-white hover:scale-105"
                >
                  <SkipForward size={16} />
                  <span>Próximo</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
