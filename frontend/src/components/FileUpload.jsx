import { forwardRef } from 'react'; // Import forwardRef
import PropTypes from 'prop-types';

// Use forwardRef to allow parent component (App.jsx) to get a ref to the input element
const FileUpload = forwardRef(({ onFileUpload, disabled }, ref) => {
  // If App.jsx passes a ref, it will be assigned to fileInputRef
  // If not, this component's internal ref is used.
  // const internalRef = useRef(null);
  // const fileInputRef = ref || internalRef;
  // Simplified: App.jsx will create and pass the ref. This component just uses it.

  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (file) {
      onFileUpload(file);
       // Clear the input value so that uploading the same file again triggers onChange
      if (event.target) event.target.value = null;
    }
  };

  const handleButtonClick = () => {
    // Access the ref passed from App.jsx (or the one created here if standalone)
    if (ref && ref.current) {
      ref.current.click();
    }
  };

  return (
    <div>
      <input
        type="file"
        accept=".pdf"
        onChange={handleFileChange}
        ref={ref} // Assign the forwarded ref to the input element
        style={{ display: 'none' }}
        id="pdf-upload-input"
        disabled={disabled}
        aria-labelledby="pdf-upload-button" // Labelled by the button
      />
      <button id="pdf-upload-button" onClick={handleButtonClick} disabled={disabled} aria-label="Upload PDF file (Ctrl+O or Cmd+O)">
        Browse PDF
      </button>
    </div>
  );
});

FileUpload.displayName = 'FileUpload'; // Good practice for forwardRef components

FileUpload.propTypes = {
  onFileUpload: PropTypes.func.isRequired,
  disabled: PropTypes.bool,
};

FileUpload.defaultProps = {
  disabled: false,
};

export default FileUpload;