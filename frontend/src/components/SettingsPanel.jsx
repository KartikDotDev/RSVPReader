// frontend/src/components/SettingsPanel.jsx
import PropTypes from 'prop-types';

function SettingsPanel({
  fontSize, onFontSizeChange,
  fontColor, onFontColorChange,
  bgColor, onBgColorChange,
  isHighContrast, onHighContrastToggle,
}) {
  return (
    <div className="settings-panel-content">
      <h3>RSVP Display</h3>
      <div className="setting-group">
        <label htmlFor="font-size-input">Font Size:</label>
        <input 
          type="number" id="font-size-input" value={fontSize} 
          onChange={(e) => onFontSizeChange(Number(e.target.value))} 
          min="12" max="120" step="2" aria-label="RSVP Font Size in pixels"
        />
        <span>px</span>
      </div>
      <div className="setting-group">
        <label htmlFor="font-color-picker">Font Color:</label>
        <input type="color" id="font-color-picker" value={fontColor} onChange={(e) => onFontColorChange(e.target.value)} aria-label="RSVP Font Color"/>
      </div>
      <div className="setting-group">
        <label htmlFor="bg-color-picker">Background Color:</label>
        <input type="color" id="bg-color-picker" value={bgColor} onChange={(e) => onBgColorChange(e.target.value)} aria-label="RSVP Background Color"/>
      </div>
      
      <h3>Accessibility</h3>
      <div className="setting-group">
        <input type="checkbox" id="high-contrast-toggle" checked={isHighContrast} onChange={onHighContrastToggle} />
        <label htmlFor="high-contrast-toggle">High Contrast Mode</label>
      </div>
      {/* Narration controls removed */}
    </div>
  );
}

SettingsPanel.propTypes = {
  fontSize: PropTypes.number.isRequired,
  onFontSizeChange: PropTypes.func.isRequired,
  fontColor: PropTypes.string.isRequired,
  onFontColorChange: PropTypes.func.isRequired,
  bgColor: PropTypes.string.isRequired,
  onBgColorChange: PropTypes.func.isRequired,
  isHighContrast: PropTypes.bool.isRequired,
  onHighContrastToggle: PropTypes.func.isRequired,
  // Narration prop types removed
};

export default SettingsPanel;