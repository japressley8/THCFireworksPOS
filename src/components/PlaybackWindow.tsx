import React, { useState, useEffect, useRef } from 'react';
import { listen, emit } from '@tauri-apps/api/event';
import { convertFileSrc } from '@tauri-apps/api/core';
import { invoke } from '@tauri-apps/api/core';
import { Play, Pause, Volume2, Video, Maximize2, Minimize2 } from 'lucide-react';

interface PlaybackWindowProps {
  themeStyles: React.CSSProperties;
}

interface VideoPayload {
  title: string;
  path: string;
}

export const PlaybackWindow: React.FC<PlaybackWindowProps> = ({ themeStyles }) => {
  const [videoTitle, setVideoTitle] = useState<string>('Showcase Screen');
  const [videoPath, setVideoPath] = useState<string>('');
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isYouTube, setIsYouTube] = useState<boolean>(false);
  const [youtubeId, setYoutubeId] = useState<string | null>(null);
  const [resolvedLocalSrc, setResolvedLocalSrc] = useState<string>('');
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  const containerRef = useRef<HTMLDivElement>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Helper to extract YouTube video ID
  const getYouTubeId = (url: string) => {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  };

  const stateRef = useRef({ isPlaying, currentTime, duration, videoTitle, videoPath });
  useEffect(() => {
    stateRef.current = { isPlaying, currentTime, duration, videoTitle, videoPath };
  }, [isPlaying, currentTime, duration, videoTitle, videoPath]);

  const handleStopVideo = () => {
    setVideoPath('');
    setVideoTitle('Showcase Screen');
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    emit('video-status-update', {
      playing: false,
      currentTime: 0,
      duration: 0,
      title: 'Showcase Screen',
      path: ''
    });
  };

  // Sync state back to main window periodically - once per 1 second using a ref to prevent event loop bottlenecks
  useEffect(() => {
    const interval = setInterval(() => {
      const state = stateRef.current;
      if (!state.videoPath) return;
      emit('video-status-update', {
        playing: state.isPlaying,
        currentTime: state.currentTime,
        duration: state.duration,
        title: state.videoTitle,
        path: state.videoPath
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Load new video event listener
  useEffect(() => {
    const unlisten = listen<VideoPayload>('showcase-play-video', async (event) => {
      const { title, path } = event.payload;
      setVideoTitle(title);
      setVideoPath(path);
      setCurrentTime(0);
      setDuration(0);
      setIsPlaying(true);

      const ytId = getYouTubeId(path);
      if (ytId) {
        setIsYouTube(true);
        setYoutubeId(ytId);
        setResolvedLocalSrc('');
      } else {
        setIsYouTube(false);
        setYoutubeId(null);
        try {
          const absolutePath = await invoke<string>('get_video_url', { filename: path });
          const assetSrc = convertFileSrc(absolutePath);
          setResolvedLocalSrc(assetSrc);
        } catch (e) {
          console.error("Failed to resolve local video path", e);
        }
      }
    });

    return () => {
      unlisten.then(f => f());
    };
  }, []);

  // Listen to remote playback commands from main window
  useEffect(() => {
    const unlistenPlay = listen('video-control-play', () => handlePlay());
    const unlistenPause = listen('video-control-pause', () => handlePause());
    const unlistenSeek = listen<{ seconds: number }>('video-control-seek', (event) => {
      handleSeek(event.payload.seconds);
    });

    return () => {
      unlistenPlay.then(f => f());
      unlistenPause.then(f => f());
      unlistenSeek.then(f => f());
    };
  }, [isYouTube, resolvedLocalSrc]);

  // Handle local video progress
  useEffect(() => {
    const video = videoRef.current;
    if (!video || isYouTube) return;

    const onTimeUpdate = () => {
      setCurrentTime(video.currentTime);
    };
    const onDurationChange = () => {
      setDuration(video.duration);
    };
    const onEnded = () => {
      handleStopVideo();
    };

    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('durationchange', onDurationChange);
    video.addEventListener('ended', onEnded);

    return () => {
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('durationchange', onDurationChange);
      video.removeEventListener('ended', onEnded);
    };
  }, [resolvedLocalSrc, isYouTube]);

  // Watch for postMessage messages from the YouTube iframe to track state
  useEffect(() => {
    if (!isYouTube || !youtubeId) return;

    const handleYTMessage = (event: MessageEvent) => {
      if (!event.origin.includes("youtube.com") && !event.origin.includes("youtube")) return;
      try {
        let data = event.data;
        if (typeof data === 'string') {
          data = JSON.parse(data);
        }
        if (data && data.event === "infoDelivery" && data.info) {
          if (data.info.currentTime !== undefined) {
            setCurrentTime(data.info.currentTime);
          }
          if (data.info.duration !== undefined) {
            setDuration(data.info.duration);
          }
          if (data.info.playerState !== undefined) {
            // playerState: 1 = playing, 2 = paused, 0 = ended
            if (data.info.playerState === 1) {
              setIsPlaying(true);
            } else if (data.info.playerState === 2) {
              setIsPlaying(false);
            } else if (data.info.playerState === 0) {
              handleStopVideo();
            }
          }
        }
      } catch (e) {
        // Not JSON or other message
      }
    };

    window.addEventListener('message', handleYTMessage);

    // Periodically post 'listening' to establish communication channel
    const interval = setInterval(() => {
      iframeRef.current?.contentWindow?.postMessage(
        JSON.stringify({ event: 'listening' }),
        '*'
      );
    }, 1000);

    return () => {
      window.removeEventListener('message', handleYTMessage);
      clearInterval(interval);
    };
  }, [isYouTube, youtubeId]);

  const handlePlay = () => {
    setIsPlaying(true);
    if (isYouTube) {
      iframeRef.current?.contentWindow?.postMessage(
        JSON.stringify({ event: 'command', func: 'playVideo', args: [] }),
        '*'
      );
    } else {
      videoRef.current?.play().catch(err => console.error(err));
    }
  };

  const handlePause = () => {
    setIsPlaying(false);
    if (isYouTube) {
      iframeRef.current?.contentWindow?.postMessage(
        JSON.stringify({ event: 'command', func: 'pauseVideo', args: [] }),
        '*'
      );
    } else {
      videoRef.current?.pause();
    }
  };

  const handleSeek = (seconds: number) => {
    setCurrentTime(seconds);
    if (isYouTube) {
      iframeRef.current?.contentWindow?.postMessage(
        JSON.stringify({ event: 'command', func: 'seekTo', args: [seconds, true] }),
        '*'
      );
    } else if (videoRef.current) {
      videoRef.current.currentTime = seconds;
    }
  };

  const handleMuteToggle = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    if (isYouTube) {
      iframeRef.current?.contentWindow?.postMessage(
        JSON.stringify({ event: 'command', func: nextMuted ? 'mute' : 'unMute', args: [] }),
        '*'
      );
    } else if (videoRef.current) {
      videoRef.current.muted = nextMuted;
    }
  };

  // Sync native state play/pause triggers
  const togglePlay = () => {
    if (isPlaying) {
      handlePause();
    } else {
      handlePlay();
    }
  };

  const handleFullscreenToggle = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => {
        setIsFullscreen(true);
      }).catch(err => {
        console.error("Error entering fullscreen: ", err);
      });
    } else {
      document.exitFullscreen().then(() => {
        setIsFullscreen(false);
      }).catch(err => {
        console.error("Error exiting fullscreen: ", err);
      });
    }
  };

  useEffect(() => {
    const handleFSChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFSChange);
    return () => document.removeEventListener('fullscreenchange', handleFSChange);
  }, []);

  const formatTime = (timeInSeconds: number) => {
    if (isNaN(timeInSeconds)) return '0:00';
    const mins = Math.floor(timeInSeconds / 60);
    const secs = Math.floor(timeInSeconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  return (
    <div 
      className="flex flex-col h-screen w-screen bg-custom-bg text-custom-text overflow-hidden font-sans select-none"
      style={themeStyles}
    >
      {/* Screen & Interactive Player Container */}
      <div 
        ref={containerRef} 
        className="flex-1 bg-black relative flex items-center justify-center overflow-hidden group w-full h-full"
      >
        {videoPath ? (
          <>
            {/* Permanent Item Name Overlay (Top Right) */}
            <div className="absolute top-4 right-4 bg-black/80 border border-custom-border/40 px-5 py-3 rounded-2xl flex flex-col z-20 pointer-events-none shadow-2xl">
              <div className="flex items-center gap-2.5">
                <Video className="h-6 w-6 text-custom-accent" />
                <span className="font-black text-2xl tracking-tight text-white uppercase">{videoTitle}</span>
              </div>
              <span className="text-xs text-custom-muted font-bold tracking-wider mt-1">
                {isYouTube ? "Streaming YouTube Online" : "Playing Offline Local Video"}
              </span>
            </div>

            {isYouTube && youtubeId ? (
              <iframe
                ref={iframeRef}
                src={`https://www.youtube.com/embed/${youtubeId}?enablejsapi=1&controls=0&rel=0&autoplay=1&origin=${encodeURIComponent(window.location.origin)}`}
                className="w-full h-full border-0 absolute inset-0 pointer-events-none"
                allow="autoplay; encrypted-media"
                title="YouTube Showcase Video"
              />
            ) : resolvedLocalSrc ? (
              <video
                ref={videoRef}
                src={resolvedLocalSrc}
                autoPlay
                className="w-full h-full object-contain"
              />
            ) : (
              <div className="text-center text-custom-muted text-xs animate-pulse">
                Resolving media...
              </div>
            )}

            {/* Controls Overlay bar - Absolute positioned, visible on hover */}
            <div className="absolute bottom-0 left-0 right-0 bg-custom-header/95 border-t border-custom-border p-4 flex flex-col gap-3 transition-opacity duration-300 opacity-0 group-hover:opacity-100 z-30 shadow-2xl">
              {/* Timeline slider */}
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-mono text-custom-muted w-10 shrink-0">
                  {formatTime(currentTime)}
                </span>
                <input
                  type="range"
                  min={0}
                  max={duration || 100}
                  value={currentTime}
                  onChange={(e) => handleSeek(parseFloat(e.target.value))}
                  className="flex-1 h-1.5 bg-custom-input rounded-lg appearance-none cursor-pointer accent-custom-accent border border-custom-border/50"
                />
                <span className="text-[10px] font-mono text-custom-muted w-10 text-right shrink-0">
                  {formatTime(duration)}
                </span>
              </div>

              {/* Lower controls button bar */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <button
                    onClick={togglePlay}
                    className="p-2.5 bg-custom-primary hover:bg-custom-primary-hover text-white rounded-xl shadow transition-all active:scale-95 flex items-center justify-center cursor-pointer"
                    title={isPlaying ? "Pause" : "Play"}
                  >
                    {isPlaying ? <Pause className="h-4.5 w-4.5" /> : <Play className="h-4.5 w-4.5 fill-white" />}
                  </button>

                  <button
                    onClick={handleMuteToggle}
                    className="p-2.5 bg-custom-input border border-custom-border hover:bg-custom-primary/10 text-custom-text rounded-xl transition-all active:scale-95 flex items-center justify-center cursor-pointer"
                    title={isMuted ? "Unmute" : "Mute"}
                  >
                    <Volume2 className="h-4.5 w-4.5" />
                  </button>

                  <button
                    onClick={handleFullscreenToggle}
                    className="p-2.5 bg-custom-input border border-custom-border hover:bg-custom-primary/10 text-custom-text rounded-xl transition-all active:scale-95 flex items-center justify-center cursor-pointer"
                    title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
                  >
                    {isFullscreen ? <Minimize2 className="h-4.5 w-4.5" /> : <Maximize2 className="h-4.5 w-4.5" />}
                  </button>
                </div>
                
                <div className="text-[10px] font-mono text-custom-muted font-bold truncate max-w-[200px]">
                  {videoTitle}
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="text-center p-8 space-y-4">
            <Video className="h-16 w-16 text-custom-accent/30 mx-auto animate-bounce duration-1000" />
            <h3 className="text-lg font-bold text-custom-text">Ready to Showcase Videos</h3>
            <p className="text-xs text-custom-muted max-w-sm leading-relaxed mx-auto">
              Open showcase videos from the register checkout, Quick Add grid, or product list. This secondary screen will load them instantly.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
