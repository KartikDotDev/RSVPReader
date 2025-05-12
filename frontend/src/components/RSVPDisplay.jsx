import PropTypes from 'prop-types';

function RSVPDisplay({ word, fontSize, color, backgroundColor }) {
  const displayWord = String(word || "");

  return (
    <div
      className="rsvp-word-container"
      style={{
        fontSize: `${fontSize}px`, 
        color: color,
        backgroundColor: backgroundColor,
      }}
      aria-live="polite" 
      aria-atomic="true" 
      role="timer" 
      aria-label={`Current word: ${displayWord}`} 
    >
      {displayWord}
    </div>
  );
}

RSVPDisplay.propTypes = {
  word: PropTypes.string,
  fontSize: PropTypes.number.isRequired,
  color: PropTypes.string.isRequired,
  backgroundColor: PropTypes.string.isRequired,
};

RSVPDisplay.defaultProps = {
  word: '',
};

export default RSVPDisplay;