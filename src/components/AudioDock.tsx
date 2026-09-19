import React, { useState, useEffect, useRef } from 'react';
import { AudioSummaryTrack } from '../types';

interface AudioDockProps {
  track: AudioSummaryTrack;
  onSpeedChange: (speed: number) => void;
}

export const AudioDock: React.FC<AudioDockProps> = ({ track, onSpeedChange }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(134); // 02:14 in seconds
  const [showTranscript, setShowTranscript] = useState(false);
  const synthRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Format seconds to mm:ss
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Speed options
  const speeds = [1.0, 1.2, 1.5, 2.0];
  const nextSpeed = () => {
    const idx = speeds.indexOf(track.speed);
    const next = speeds[(idx + 1) % speeds.length];
    onSpeedChange(next);
  };

  // Play / pause simulation with Web Speech API
  const togglePlay = () => {
    if (!isPlaying) {
      setIsPlaying(true);
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const currentSnippet = track.transcript[Math.min(Math.floor(currentTime / 60), track.transcript.length - 1)];
        const utter = new SpeechSynthesisUtterance(currentSnippet ? `${currentSnippet.speaker}: ${currentSnippet.text}` : track.title);
        utter.rate = track.speed;
        utter.onend = () => {
          // keep running timer
        };
        synthRef.current = utter;
        try {
          window.speechSynthesis.speak(utter);
        } catch {
          // ignore if speech synthesis blocked
        }
      }
    } else {
      setIsPlaying(false);
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    }
  };

  // Timer ticker when playing
  useEffect(() => {
    let interval: any = null;
    if (isPlaying) {
      interval = setInterval(() => {
        setCurrentTime((prev) => {
          if (prev >= track.durationSeconds) {
            setIsPlaying(false);
            return 0;
          }
          return prev + 1;
        });
      }, 1000 / track.speed);
    }
    return () => clearInterval(interval);
  }, [isPlaying, track.speed, track.durationSeconds]);

  // Scrubber click handler
  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clickX / rect.width));
    const newTime = Math.floor(ratio * track.durationSeconds);
    setCurrentTime(newTime);
  };

  const progressPercent = Math.min(100, (currentTime / track.durationSeconds) * 100);

  return (
    <>
      <div className="fixed bottom-0 left-0 lg:left-64 right-0 bg-white/95 backdrop-blur-xl border-t border-[#c5c6ce]/40 px-4 lg:px-8 py-3 z-30 shadow-[0_-4px_20px_rgba(0,0,0,0.06)]">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3">
          {/* Left: Play button + Title info */}
          <div className="flex items-center gap-3.5 w-full md:w-auto">
            <button
              id="play-pause-btn"
              onClick={togglePlay}
              aria-label={isPlaying ? 'Pause audio summary' : 'Play audio summary'}
              className="w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-[#0051d5] text-white flex items-center justify-center shadow-md hover:bg-[#316bf3] transition-transform active:scale-95 shrink-0"
              type="button"
            >
              <span className="material-symbols-outlined text-[24px]" id="play-icon">
                {isPlaying ? 'pause' : 'play_arrow'}
              </span>
            </button>

            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-bold text-[13px] sm:text-[14px] text-[#0b1c30] truncate">
                  {track.title}
                </span>
                <span
                  onClick={nextSpeed}
                  className="cursor-pointer font-semibold text-[11px] text-[#0051d5] bg-[#dbe1ff] px-2 py-0.5 rounded-full hover:bg-blue-200 transition-colors"
                  title="Click to toggle speed"
                >
                  {track.speed}x Speed
                </span>
              </div>
              <span className="text-[12px] text-[#44474d] truncate mt-0.5">
                {track.subtitle}
              </span>
            </div>
          </div>

          {/* Right: Scrubber, Timestamps & Controls */}
          <div className="flex items-center gap-3 sm:gap-4 w-full md:w-1/2 lg:w-3/5">
            <span className="text-[11px] sm:text-[12px] font-medium text-[#44474d] tabular-nums">
              {formatTime(currentTime)}
            </span>

            {/* Clickable Progress Bar */}
            <div
              onClick={handleSeek}
              className="flex-1 bg-[#e5eeff] h-2.5 rounded-full overflow-hidden relative cursor-pointer group"
              title="Seek audio position"
            >
              <div
                className="bg-[#0051d5] h-full rounded-full transition-all duration-150 group-hover:bg-[#316bf3]"
                style={{ width: `${progressPercent}%` }}
              ></div>
            </div>

            <span className="text-[11px] sm:text-[12px] font-medium text-[#44474d] tabular-nums">
              {formatTime(track.durationSeconds)}
            </span>

            {/* Action Buttons */}
            <div className="flex items-center gap-1 text-[#44474d]">
              <button
                onClick={nextSpeed}
                aria-label="Toggle playback speed"
                className="px-2 py-1 rounded-lg hover:bg-[#eff4ff] text-[12px] font-bold text-[#0051d5]"
                type="button"
              >
                {track.speed}x
              </button>

              <button
                onClick={() => setShowTranscript(!showTranscript)}
                aria-label="View dialogue transcript"
                className={`p-1.5 rounded-lg transition-colors ${
                  showTranscript ? 'bg-[#dbe1ff] text-[#0051d5]' : 'hover:bg-[#eff4ff]'
                }`}
                title="View AI Dialogue Transcript"
                type="button"
              >
                <span className="material-symbols-outlined text-[20px]">chat</span>
              </button>

              <button
                onClick={() => {
                  alert('Audio podcast episode downloaded: Electrostatics_Module3_AI_Voice_Duo.mp3');
                }}
                aria-label="Download audio episode"
                className="p-1.5 rounded-lg hover:bg-[#eff4ff] text-[#44474d] hover:text-[#0b1c30]"
                type="button"
                title="Download Episode"
              >
                <span className="material-symbols-outlined text-[20px]">download</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Transcript Drawer Modal */}
      {showTranscript && (
        <div className="fixed bottom-20 left-4 lg:left-72 right-4 lg:right-12 max-w-2xl mx-auto bg-white rounded-2xl shadow-2xl border border-[#c5c6ce]/60 p-5 z-40 max-h-96 flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-200">
          <div className="flex items-center justify-between pb-3 border-b border-[#c5c6ce]/40">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[#0051d5]">mic</span>
              <h4 className="font-bold text-[15px] text-[#0b1c30]">Two-Host AI Dialogue Transcript</h4>
            </div>
            <button
              onClick={() => setShowTranscript(false)}
              className="text-[#75777e] hover:text-[#0b1c30] p-1 rounded-lg"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto space-y-3 py-3 pr-1 text-[13px]">
            {track.transcript.map((item, idx) => (
              <div
                key={idx}
                className={`p-3 rounded-xl ${
                  item.speaker.includes('Alex')
                    ? 'bg-[#eff4ff] border border-[#dbe1ff]'
                    : 'bg-[#f8f9ff] border border-[#e5eeff]'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-[#0051d5] text-[12px]">{item.speaker}</span>
                  <span className="text-[11px] text-[#75777e] font-mono">{item.timestamp}</span>
                </div>
                <p className="text-[#334155] leading-relaxed">{item.text}</p>
              </div>
            ))}
          </div>
          <div className="pt-2 text-[11px] text-[#75777e] text-center border-t border-[#c5c6ce]/30">
            Powered by Next-Gen Neural Voice 3.2 • High-fidelity synthesized discussion
          </div>
        </div>
      )}
    </>
  );
};
