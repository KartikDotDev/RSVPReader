// frontend/src/components/Controls.jsx
import PropTypes from 'prop-types';

function Controls({
  isPlaying,
  onPlayPause,
  wpm,
  onWpmChange,
  onRestart,
  hasContent,
  currentWordIndex, 
  totalWords,     
  onSeek,          
  disabled,
  minWpm,
  maxWpm,
}) {
  const handleWpmInputChange = (e) => {
    const newWpm = parseInt(e.target.value, 10);
    if (!isNaN(newWpm)) {
        onWpmChange(newWpm);
    }
  };

  const handlePrevious = () => {
    if (currentWordIndex > 0) {
      onSeek(currentWordIndex - 1);
    }
  };

  const handleNext = () => {
    if (currentWordIndex < totalWords - 1) {
      onSeek(currentWordIndex + 1);
    }
  };

  return (
    <div className="controls-container">
      <button onClick={onPlayPause} disabled={!hasContent || disabled} aria-label={isPlaying ? "Pause (Space)" : "Play (Space)"}>
        {isPlaying ? 'Pause' : 'Play'}
      </button>
      <button onClick={onRestart} disabled={!hasContent || disabled} aria-label="Restart reading from beginning (R)">
        Restart
      </button>
      <div className="wpm-control">
        <label htmlFor="wpm-input-label">Rate (WPM):</label>
        <input
          type="number"
          id="wpm-input-label"
          className="wpm-number-input"
          min={minWpm}
          max={maxWpm}
          step="10"
          value={wpm}
          onChange={handleWpmInputChange}
          disabled={disabled}
          aria-label={`Reading rate: ${wpm} words per minute. Editable field.`}
        />
        <input
          type="range"
          id="wpm-slider"
          min={minWpm}
          max={maxWpm}
          step="10"
          value={wpm}
          onChange={handleWpmInputChange}
          disabled={disabled}
          aria-label="Reading rate slider"
          aria-valuetext={`${wpm} WPM`}
        />
      </div>
      <button onClick={handlePrevious} disabled={!hasContent || disabled || currentWordIndex === 0} aria-label="Previous Sentence (←)">
        Prev Sent.
      </button>
      <button onClick={handleNext} disabled={!hasContent || disabled || currentWordIndex >= totalWords - 1} aria-label="Next Sentence (→)">
        Next Sent.
      </button>
    </div>
  );
}

Controls.propTypes = {
  isPlaying: PropTypes.bool.isRequired,
  onPlayPause: PropTypes.func.isRequired,
  wpm: PropTypes.number.isRequired,
  onWpmChange: PropTypes.func.isRequired,
  onRestart: PropTypes.func.isRequired,
  hasContent: PropTypes.bool.isRequired,
  currentWordIndex: PropTypes.number.isRequired,
  totalWords: PropTypes.number.isRequired,    
  onSeek: PropTypes.func.isRequired,          
  disabled: PropTypes.bool.isRequired,
  minWpm: PropTypes.number.isRequired,
  maxWpm: PropTypes.number.isRequired,
};

export default Controls;