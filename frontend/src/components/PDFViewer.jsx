import { useState, useEffect, useRef, useCallback, useMemo } from 'react'; // Added useMemo
import PropTypes from 'prop-types';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import 'react-pdf/dist/esm/Page/TextLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc = `/js/pdf.worker.min.js`;

function PDFViewer({ file, currentPageFromApp, numPagesFromApp, onPageChangeByViewer }) {
  const [internalNumPages, setInternalNumPages] = useState(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [zoom, setZoom] = useState(1.0);
  const [pdfLoadError, setPdfLoadError] = useState(null);
  const [isDocumentReady, setIsDocumentReady] = useState(false);

  const viewerInitiatedChangeRef = useRef(false);
  const documentWrapperRef = useRef(null);

  // Memoize options for react-pdf Document to prevent unnecessary reloads
  const memoizedOptions = useMemo(() => ({
    // cMapUrl: `https://unpkg.com/pdfjs-dist@${pdfjs.version}/cmaps/`, // Optional
    // cMapPacked: true, // Optional
  }), []);


  useEffect(() => {
    if (file) { // file is now { data: ArrayBuffer } or null
      setPageNumber(1);
      setInternalNumPages(null);
      setPdfLoadError(null);
      setIsDocumentReady(false);
    } else {
      setInternalNumPages(null);
      setPdfLoadError(null);
      setPageNumber(1);
      setIsDocumentReady(false);
    }
  }, [file]);

  useEffect(() => {
    if (file && isDocumentReady && currentPageFromApp !== pageNumber && !viewerInitiatedChangeRef.current) {
      setPageNumber(currentPageFromApp);
    }
    if (viewerInitiatedChangeRef.current) {
      viewerInitiatedChangeRef.current = false;
    }
  }, [currentPageFromApp, file, pageNumber, isDocumentReady]);

  const onDocumentLoadSuccess = useCallback(({ numPages: loadedNumPages }) => {
    setInternalNumPages(loadedNumPages);
    setPdfLoadError(null);
    setIsDocumentReady(true);
    if (onPageChangeByViewer) {
        onPageChangeByViewer(1, loadedNumPages, true);
    }
    if (pageNumber > loadedNumPages && loadedNumPages > 0) setPageNumber(loadedNumPages);
    else if (pageNumber < 1 && loadedNumPages > 0) setPageNumber(1);
  }, [onPageChangeByViewer, pageNumber]);


  function onDocumentLoadError(error) {
    console.error('PDFViewer: Error loading PDF document:', error.message, error);
    let friendlyMessage = `PDF Preview Error: ${error.message}.`;
    if (error.name === 'InvalidPDFException') {
        friendlyMessage = "Invalid or corrupted PDF file.";
    } else if (error.name === 'MissingPDFException') {
        friendlyMessage = "PDF file not found or could not be loaded.";
    } else if (error.name === 'PasswordException') {
        friendlyMessage = "This PDF is password-protected and cannot be displayed.";
    } else if (error.message.toLowerCase().includes("detached arraybuffer")) {
        friendlyMessage = "PDF data error (detached ArrayBuffer). Try uploading the file again.";
    } else if (!navigator.onLine && error.message.toLowerCase().includes("worker")) {
        friendlyMessage = "Cannot load PDF worker: You appear to be offline.";
    } else if (error.message.toLowerCase().includes("worker")) {
        friendlyMessage = "PDF Worker failed to load. Ensure 'pdf.worker.min.js' is correctly placed in public/js folder.";
    }
    setPdfLoadError(friendlyMessage);
    setInternalNumPages(null);
    setIsDocumentReady(false);
  }

  const navigateToPage = (newPageInput) => {
    if (!internalNumPages || !isDocumentReady) return;
    let newPageNumber = parseInt(newPageInput, 10);
    if (isNaN(newPageNumber)) {
        const inputTarget = document.getElementById('pdf-page-input');
        if (inputTarget) newPageNumber = parseInt(inputTarget.value, 10);
        if (isNaN(newPageNumber)) return;
    }
    const newPage = Math.max(1, Math.min(newPageNumber, internalNumPages));
    if (newPage !== pageNumber) {
      viewerInitiatedChangeRef.current = true;
      setPageNumber(newPage);
      if (onPageChangeByViewer) {
        onPageChangeByViewer(newPage, internalNumPages, false);
      }
    }
  };

  const goToPrevPage = () => navigateToPage(pageNumber - 1);
  const goToNextPage = () => navigateToPage(pageNumber + 1);
  const handleZoomIn = () => setZoom(prev => Math.min(3, prev + 0.1));
  const handleZoomOut = () => setZoom(prev => Math.max(0.3, prev - 0.1));
  const handleActualSize = () => setZoom(1.0);
  const handleFitWidth = () => {
    if (documentWrapperRef.current) {
        setZoom(1.2); 
    }
  };

  if (pdfLoadError) {
    return <div className="pdf-placeholder pdf-error" role="alert">{pdfLoadError}</div>;
  }
  if (!file || !file.data) { // Check for file and file.data as App now sends { data: ArrayBuffer }
    return <div className="pdf-placeholder">Upload a PDF to view its preview here.</div>;
  }

  return (
    <div className="pdf-viewer-container">
      <div className="pdf-controls">
        <button onClick={goToPrevPage} disabled={pageNumber <= 1 || !isDocumentReady} aria-label="Previous PDF page">Prev</button>
        <span>
            Page{' '}
            <input
                id="pdf-page-input" type="number" value={pageNumber} min="1"
                max={internalNumPages || numPagesFromApp || 1}
                onChange={(e) => navigateToPage(e.target.value)}
                disabled={!isDocumentReady || !internalNumPages}
                aria-label={`Current page ${pageNumber} of ${internalNumPages || numPagesFromApp || '...'}. Edit to jump to page.`}
                style={{width: "50px", textAlign: "center"}}
            />
            {' of '} {internalNumPages || numPagesFromApp || '...'}
        </span>
        <button onClick={goToNextPage} disabled={!isDocumentReady || !internalNumPages || pageNumber >= internalNumPages} aria-label="Next PDF page">Next</button>
        <button onClick={handleZoomOut} disabled={zoom <= 0.3 || !isDocumentReady} aria-label="Zoom out">-</button>
        <button onClick={handleActualSize} disabled={!isDocumentReady} aria-label="Actual size">100%</button>
        <button onClick={handleFitWidth} disabled={!isDocumentReady} aria-label="Fit width (approximate)">Fit Width</button>
        <button onClick={handleZoomIn} disabled={zoom >= 3 || !isDocumentReady} aria-label="Zoom in">+</button>
        <span aria-live="polite">{Math.round(zoom*100)}%</span>
      </div>
      <div className="pdf-document-wrapper" ref={documentWrapperRef}>
        <Document
          file={file} // file is now { data: ArrayBuffer }
          onLoadSuccess={onDocumentLoadSuccess}
          onLoadError={onDocumentLoadError}
          loading={<div className="pdf-loading" role="status">Loading PDF preview...</div>}
          error={<div className="pdf-error" role="alert">Could not load PDF. File might be invalid or worker not found. Check console.</div>}
          options={memoizedOptions}
        >
          {isDocumentReady && internalNumPages && (
            <Page
              key={`page_${pageNumber}_${file?.name || 'pdf-doc'}_z${zoom}`}
              pageNumber={pageNumber}
              scale={zoom}
              renderTextLayer={true}
              renderAnnotationLayer={true}
              loading={<div className="pdf-loading" role="status">Rendering page {pageNumber}...</div>}
              error={<div className="pdf-error" role="alert">Error rendering page {pageNumber}.</div>}
              width={documentWrapperRef.current ? documentWrapperRef.current.clientWidth * 0.95 : undefined}
            />
          )}
        </Document>
      </div>
    </div>
  );
}

PDFViewer.propTypes = {
  file: PropTypes.shape({ // Expects an object with a 'data' property which is an ArrayBuffer
    data: PropTypes.instanceOf(ArrayBuffer)
  }),
  currentPageFromApp: PropTypes.number.isRequired,
  numPagesFromApp: PropTypes.number,
  onPageChangeByViewer: PropTypes.func.isRequired,
};

export default PDFViewer;