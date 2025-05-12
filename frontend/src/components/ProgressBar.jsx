import PropTypes from 'prop-types';

function ProgressBar({ current, total }) {
  // Ensure current doesn't exceed total for percentage calculation
  const currentProgress = Math.min(current, total);
  const percentage = total > 0 ? (currentProgress / total) * 100 : 0;
  const progressText = total > 0 ? `${Math.round(percentage)}% complete` : "No content loaded";
  
  return (
    <div 
      className="progress-bar-container" 
      role="progressbar" 
      aria-valuenow={percentage} 
      aria-valuemin="0" 
      aria-valuemax="100" 
      aria-valuetext={progressText} // More descriptive for screen readers
      aria-label="Reading progress"
    >
      <div 
        className="progress-bar-fill" 
        style={{ width: `${percentage}%` }}
      >
        <span className="visually-hidden">{progressText}</span>
      </div>
    </div>
  );
}

ProgressBar.propTypes = {
  current: PropTypes.number.isRequired, // Current item index (0-based or 1-based, ensure consistency)
  total: PropTypes.number.isRequired,   // Total number of items
};

export default ProgressBar;