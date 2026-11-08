import { useEffect, useRef } from 'react';

function AudioPlayer({ src, autoPlay = false }) {
  const audioRef = useRef(null);

  useEffect(() => {
    if (audioRef.current && src) {
      audioRef.current.load();

      if (autoPlay) {
        audioRef.current.play().catch((error) => {
          console.error('Audio autoplay failed:', error);
        });
      }
    }
  }, [src, autoPlay]);

  if (!src) {
    return null;
  }

  return (
    <div className="audio-player">
      <audio
        ref={audioRef}
        src={src}
        controls
        autoPlay={autoPlay}
        preload="auto"
        style={{ width: '100%' }}
      >
        Your browser does not support audio playback.
      </audio>
    </div>
  );
}

export default AudioPlayer;