import { useState, useEffect, createRef } from 'react';

const SOUND_DEFINITIONS = [
  { id: 'forest', name: 'Forest', src: '/sounds/forest_ambience.mp3' },
  { id: 'rain', name: 'Rain', src: '/sounds/calming_rain_with_brown_noise.mp3' },
  { id: 'cafe_noise', name: 'Cafe Noise', src: '/sounds/cafe_noise.mp3' },
];

function AmbientSoundPlayer() {
  const [soundControls, setSoundControls] = useState(() =>
    SOUND_DEFINITIONS.map(soundDef => ({
      ...soundDef,
      isPlaying: false,
      volume: 0.3,
      audioRef: createRef(),
    }))
  );

  // Effect to control play/pause/volume based on state
  useEffect(() => {
    // console.log("AmbientSoundPlayer: soundControls state updated:", soundControls); // Keep for debugging if needed
    soundControls.forEach(sound => {
      const audio = sound.audioRef.current;
      if (audio) {
        // console.log(`AmbientSoundPlayer: Processing ${sound.name}. IsPlaying: ${sound.isPlaying}, Audio Paused: ${audio.paused}, Volume: ${audio.volume}, ReadyState: ${audio.readyState}`);
        audio.volume = sound.volume;
        if (sound.isPlaying && audio.paused) {
          // console.log(`AmbientSoundPlayer: Attempting to play ${sound.name}`);
          audio.play()
            .then(() => {
              // console.log(`AmbientSoundPlayer: ${sound.name} started playing successfully.`);
            })
            .catch(error => {
              console.error(`AmbientSoundPlayer: Error playing ${sound.name}:`, error.name, error.message, error);
            });
        } else if (!sound.isPlaying && !audio.paused) {
          // console.log(`AmbientSoundPlayer: Attempting to pause ${sound.name}`);
          audio.pause();
          // console.log(`AmbientSoundPlayer: ${sound.name} paused.`);
        }
      } else {
        // console.warn(`AmbientSoundPlayer: Audio ref for ${sound.name} is not available.`);
      }
    });
  }, [soundControls]); // This effect correctly depends on soundControls

  const togglePlay = (soundId) => {
    // console.log(`AmbientSoundPlayer: togglePlay called for ${soundId}`);
    setSoundControls(prevControls =>
      prevControls.map(sc =>
        sc.id === soundId ? { ...sc, isPlaying: !sc.isPlaying } : sc
      )
    );
  };

  const handleVolumeChange = (soundId, newVolumeStr) => {
    const newVolume = parseFloat(newVolumeStr);
    // console.log(`AmbientSoundPlayer: handleVolumeChange for ${soundId} to ${newVolume}`);
    setSoundControls(prevControls =>
      prevControls.map(sc =>
        sc.id === soundId ? { ...sc, volume: newVolume } : sc
      )
    );
  };

  // Cleanup effect specifically for when the AmbientSoundPlayer component truly unmounts
  useEffect(() => {
    // Capture the refs in a variable that the cleanup function can close over
    const audioRefsToClean = soundControls.map(sc => sc.audioRef);
    return () => {
      console.log("AmbientSoundPlayer: Component Unmounting. Pausing all sounds.");
      audioRefsToClean.forEach(audioRef => {
        const audio = audioRef.current;
        if (audio && !audio.paused) {
          audio.pause();
        }
      });
    };
  }, []); // Empty dependency array: runs only on mount and unmount

  if (SOUND_DEFINITIONS.length === 0) {
    return (
      <div className="ambient-sound-player">
        <h4>Ambient Sounds</h4>
        <p>No ambient sounds configured.</p>
      </div>
    );
  }

  return (
    <div className="ambient-sound-player">
      <h4>Ambient Sounds</h4>
      {soundControls.map((sound) => (
        <div key={sound.id} className="ambient-sound-control-group">
          <audio
            ref={sound.audioRef}
            src={sound.src}
            loop
            preload="auto"
            onLoadedData={() => {
              // console.log(`AmbientSoundPlayer: ${sound.name} onLoadedData fired. ReadyState: ${sound.audioRef.current?.readyState}`);
            }}
            onCanPlay={() => {
              // console.log(`AmbientSoundPlayer: ${sound.name} onCanPlay fired. ReadyState: ${sound.audioRef.current?.readyState}`);
              if (sound.audioRef.current) {
                sound.audioRef.current.volume = sound.volume;
              }
            }}
            onPlay={() => { /* console.log(`AmbientSoundPlayer: ${sound.name} onPlay event fired.`) */ }}
            onPause={() => { /* console.log(`AmbientSoundPlayer: ${sound.name} onPause event fired.`) */ }}
            onError={(e) => console.error(`AmbientSoundPlayer: Error event on ${sound.name} audio element:`, e.target.error)}
          />
          <span className="ambient-sound-name">{sound.name}</span>
          <div className="ambient-controls-inline">
            <button
              onClick={() => togglePlay(sound.id)}
              aria-label={sound.isPlaying ? `Pause ${sound.name}` : `Play ${sound.name}`}
            >
              {sound.isPlaying ? 'Pause' : 'Play'}
            </button>
            <label htmlFor={`volume-${sound.id}`} className="visually-hidden">Volume for {sound.name}</label>
            <input
              type="range"
              id={`volume-${sound.id}`}
              min="0"
              max="1"
              step="0.01"
              value={sound.volume}
              onChange={(e) => handleVolumeChange(sound.id, e.target.value)}
              aria-label={`Volume for ${sound.name}`}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export default AmbientSoundPlayer;