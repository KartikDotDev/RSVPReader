// frontend/src/App.jsx
import { useState, useEffect, useCallback, useRef } from 'react';
import './App.css';
import RSVPDisplay from '@/components/RSVPDisplay.jsx';
import PDFViewer from '@/components/PDFViewer.jsx';
import Controls from '@/components/Controls.jsx';
import FileUpload from '@/components/FileUpload.jsx';
import AmbientSoundPlayer from '@/components/AmbientSoundPlayer.jsx';
import SettingsPanel from '@/components/SettingsPanel.jsx';
import ProgressBar from '@/components/ProgressBar.jsx';
import * as pdfjsLib from 'pdfjs-dist';
import usePreciseInterval from './hooks/usePreciseInterval';

pdfjsLib.GlobalWorkerOptions.workerSrc = `/js/pdf.worker.min.js`;

const DEFAULT_WPM = 200;
const AVG_CHARS_PER_WORD = 5;
const INTER_SENTENCE_PAUSE_MS = 250;
const MIN_WORD_DISPLAY_MS = 80;
const MAX_WORD_DISPLAY_MS = 2000;
const MAX_WPM_LIMIT = 1000;
const MIN_WPM_LIMIT = 30;


function App() {
  const [sentences, setSentences] = useState([]);
  const [currentSentenceIndex, setCurrentSentenceIndex] = useState(0);
  const [currentWordForRSVP, setCurrentWordForRSVP] = useState("");
  const [currentWordInSentenceIndex, setCurrentWordInSentenceIndex] = useState(0);

  const [pageSentenceIndices, setPageSentenceIndices] = useState([]);
  const [numPages, setNumPages] = useState(0);

  const [isPlaying, setIsPlaying] = useState(false);
  const [wpm, setWpm] = useState(DEFAULT_WPM);

  const [originalPdfFile, setOriginalPdfFile] = useState(null);
  const [pdfDataForViewer, setPdfDataForViewer] = useState(null);

  const [currentTextPage, setCurrentTextPage] = useState(1);
  const [isLoadingPdf, setIsLoadingPdf] = useState(false);
  const [pdfError, setPdfError] = useState(null);

  const [fontSize, setFontSize] = useState(48);
  const [fontColor, setFontColor] = useState('#000000');
  const [bgColor, setBgColor] = useState('#FFFFFF');
  const [isHighContrast, setIsHighContrast] = useState(false);

  const [isSettingsPanelOpen, setIsSettingsPanelOpen] = useState(false);
  const [rsvpWordInterval, setRsvpWordInterval] = useState(null);
  const [showPageTurnNotification, setShowPageTurnNotification] = useState(false);

  const isPlayingRef = useRef(isPlaying);
  const sentencesRef = useRef(sentences);
  const currentSentenceIndexRef = useRef(currentSentenceIndex);
  const wpmRef = useRef(wpm);
  const pageSentenceIndicesRef = useRef(pageSentenceIndices);
  const fileInputRef = useRef(null);
  const currentSentenceWordsMapRef = useRef([]);

  const advanceToNextSentence = useCallback(() => {
    const currentIdx = currentSentenceIndexRef.current;
    const allSentences = sentencesRef.current;

    if (currentIdx < allSentences.length - 1) {
      const dynamicPause = INTER_SENTENCE_PAUSE_MS + (25000 / wpmRef.current);
      setTimeout(() => {
        setCurrentSentenceIndex(currentIdx + 1);
      }, Math.min(dynamicPause, 800));
    } else {
      setIsPlaying(false);
      setCurrentWordForRSVP("");
    }
  }, []);

  const advanceRSVPWord = useCallback(() => {
    setCurrentWordInSentenceIndex(prevWordIdx => {
        const currentSentenceWords = currentSentenceWordsMapRef.current;
        if (!currentSentenceWords || currentSentenceWords.length === 0) {
            setRsvpWordInterval(null);
            return prevWordIdx;
        }
        const nextWordIdx = prevWordIdx + 1;
        if (nextWordIdx < currentSentenceWords.length) {
            const nextWordData = currentSentenceWords[nextWordIdx];
            setCurrentWordForRSVP(nextWordData.word);
            setRsvpWordInterval(nextWordData.estimatedDurationMs);
            return nextWordIdx;
        } else {
            setRsvpWordInterval(null);
            advanceToNextSentence();
            return prevWordIdx;
        }
    });
  }, [advanceToNextSentence]);

  usePreciseInterval(
    advanceRSVPWord,
    rsvpWordInterval,
    isPlaying && sentences.length > 0 && currentSentenceIndex < sentences.length && rsvpWordInterval !== null
  );

  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { sentencesRef.current = sentences; }, [sentences]);
  useEffect(() => { currentSentenceIndexRef.current = currentSentenceIndex; }, [currentSentenceIndex]);
  useEffect(() => { wpmRef.current = wpm; }, [wpm]);
  useEffect(() => { pageSentenceIndicesRef.current = pageSentenceIndices; }, [pageSentenceIndices]);

  useEffect(() => {
    document.body.classList.toggle('high-contrast', isHighContrast);
    if (isHighContrast) {
      setFontColor(document.documentElement.style.getPropertyValue('--rsvp-text-color') || '#FFFF00');
      setBgColor(document.documentElement.style.getPropertyValue('--rsvp-bg-color') || '#000000');
    } else { setFontColor('#000000'); setBgColor('#FFFFFF'); }
  }, [isHighContrast]);

  const cleanTextForProcessing = (text) => {
    if (!text) return "";
    let cleaned = text;
    cleaned = cleaned.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    cleaned = cleaned.replace(/(\w)-(\s*)\n(\s*)(\w)/g, '$1$4');
    cleaned = cleaned.replace(/\n\s*\n+/g, ' <PARAGRAPH_MARKER> ');
    cleaned = cleaned.replace(/(?<!<PARAGRAPH_MARKER>)\s*\n\s*(?!<PARAGRAPH_MARKER>)/g, ' ');
    cleaned = cleaned.replace(/ <PARAGRAPH_MARKER> /g, '\n\n');

    const lines = cleaned.split('\n');
    const processedLines = lines.map(line => {
        let trimmedLine = line.trim();
        if (trimmedLine.length > 0 && trimmedLine.length < 15 && /^[0-9\s\-pPaAgGeE\W]+$/.test(trimmedLine) && !/[a-zA-Z]{3,}/.test(trimmedLine)) return "";
        if (trimmedLine.length > 0 && trimmedLine.length < 5 && !trimmedLine.match(/[a-zA-Z]/)) return "";
        return trimmedLine;
    }).filter(line => line.length > 0);
    cleaned = processedLines.join('\n');

    cleaned = cleaned.replace(/\s+/g, ' ');
    cleaned = cleaned.replace(/\s+([,.!?;:"])/g, '$1');
    cleaned = cleaned.replace(/([,.!?;:])([^\s"])/g, '$1 $2');
    cleaned = cleaned.replace(/\.{3,}/g, '...');
    return cleaned.trim();
  };

  const segmentTextIntoSentences = (textBlock) => {
    if (!textBlock) return [];
    const sentencesArray = textBlock.split(/(?<=[.!?…])\s+|\n{2,}/);
    return sentencesArray
        .map(s => s.trim().replace(/\s+/g, ' '))
        .filter(s => {
            if (s.length < 3) return false;
            if (!/[a-zA-Z0-9]/.test(s)) return false;
            if (/^[._\-~\s<>#*=|\[\](\p{P}\p{S})]+$/u.test(s) && s.length < 10) return false;
            if (s.length < 10 && !s.match(/[a-zA-Z]{4,}/) && !s.match(/\s/)) return false;
            return true;
        });
  };

  const extractTextFromPdfPage = async (pdfDocProxy, pageNum) => {
    const page = await pdfDocProxy.getPage(pageNum);
    const textContent = await page.getTextContent({ normalizeWhitespace: true });
    return textContent.items.map(item => item.str).join(' ').replace(/\s+/g, ' ').trim();
  };

  const calculateCurrentPageFromSentenceIndex = useCallback((sentenceIdx) => {
    const indices = pageSentenceIndicesRef.current;
    if (!indices || indices.length === 0 || sentenceIdx < 0) return 1;
    const effectiveSentenceIdx = Math.min(sentenceIdx, sentencesRef.current.length -1);
    for (let i = indices.length - 1; i >= 0; i--) {
      if (effectiveSentenceIdx >= indices[i]) return i + 1;
    }
    return 1;
  }, []);

  useEffect(() => {
    if (!isPlaying || sentences.length === 0 || currentSentenceIndex >= sentences.length) {
      setRsvpWordInterval(null);
      if (!isPlaying && sentences.length > 0 && currentSentenceIndex < sentences.length) {
        const currentSentenceText = sentences[currentSentenceIndex];
        const firstWordMatch = currentSentenceText?.match(/^(\S+)/);
        setCurrentWordForRSVP(firstWordMatch ? firstWordMatch[1] : "");
      } else {
        setCurrentWordForRSVP("");
      }
      return;
    }

    let sentenceToProcess = sentences[currentSentenceIndex];
    if (!sentenceToProcess || !sentenceToProcess.trim()) {
      advanceToNextSentence(); return;
    }

    const wordsInSentence = sentenceToProcess.split(/\s+/).filter(w => w.length > 0);
    if (wordsInSentence.length === 0) {
      advanceToNextSentence(); return;
    }

    const msPerWordBase = (60 * 1000) / wpm;

    currentSentenceWordsMapRef.current = wordsInSentence.map(word => {
      let charCount = word.length;
      let duration = (charCount / AVG_CHARS_PER_WORD) * msPerWordBase;

      if (word.match(/[,;:()"“”—]/)) duration += msPerWordBase * 0.25;
      if (word.match(/[.!?…]$/)) duration += msPerWordBase * 0.5;
      if (word.length > 10) duration += msPerWordBase * 0.2;
      if (word.length < 4) duration -= msPerWordBase * 0.15;

      const estimatedDurationMs = Math.max(MIN_WORD_DISPLAY_MS, Math.min(duration, MAX_WORD_DISPLAY_MS));
      return { word, estimatedDurationMs };
    });

    if (currentSentenceWordsMapRef.current.length > 0) {
      setCurrentWordInSentenceIndex(0);
      const firstWordData = currentSentenceWordsMapRef.current[0];
      setCurrentWordForRSVP(firstWordData.word);
      setRsvpWordInterval(firstWordData.estimatedDurationMs);
    } else {
      setRsvpWordInterval(null);
      advanceToNextSentence();
    }
  }, [isPlaying, currentSentenceIndex, sentences, wpm, advanceToNextSentence]);

  useEffect(() => {
    if (sentences.length > 0) {
      const newPage = calculateCurrentPageFromSentenceIndex(currentSentenceIndex);
      if (newPage !== currentTextPage) {
        setCurrentTextPage(newPage);
        if (isPlayingRef.current) {
            setShowPageTurnNotification(true);
            setTimeout(() => setShowPageTurnNotification(false), 1500);
        }
      }
    } else if (currentTextPage !== 1) {
      setCurrentTextPage(1);
    }
  }, [currentSentenceIndex, sentences, calculateCurrentPageFromSentenceIndex, currentTextPage]);

  const handleFileUpload = async (file) => {
    if (!file) return;
    setOriginalPdfFile(file); setPdfDataForViewer(null); setIsLoadingPdf(true); setPdfError(null);
    setSentences([]); setPageSentenceIndices([]); setCurrentSentenceIndex(0); setCurrentWordForRSVP("");
    setCurrentWordInSentenceIndex(0); setNumPages(0); setIsPlaying(false); setCurrentTextPage(1);
    setRsvpWordInterval(null); currentSentenceWordsMapRef.current = [];
    await new Promise(resolve => setTimeout(resolve, 0));

    try {
      const rawArrayBuffer = await file.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({ data: rawArrayBuffer.slice(0) });
      const pdfDocProxy = await loadingTask.promise;
      const docNumPages = pdfDocProxy.numPages; setNumPages(docNumPages);

      let allDocSentences = [];
      const calculatedPageSentenceIndices = [];

      for (let i = 1; i <= docNumPages; i++) {
          calculatedPageSentenceIndices.push(allDocSentences.length);

          const pageText = await extractTextFromPdfPage(pdfDocProxy, i);
          const cleanedPageText = cleanTextForProcessing(pageText);
          const sentencesOnThisPage = segmentTextIntoSentences(cleanedPageText);

          allDocSentences.push(...sentencesOnThisPage);
      }

      if (allDocSentences.length === 0) {
        const pageTexts = [];
        for (let i = 1; i <= docNumPages; i++) { pageTexts.push(await extractTextFromPdfPage(pdfDocProxy, i));}
        const fullTextAggregated = pageTexts.join("\n\n");
        const cleanedFullText = cleanTextForProcessing(fullTextAggregated);
        allDocSentences = segmentTextIntoSentences(cleanedFullText);
        if (allDocSentences.length === 0 && cleanedFullText.length > 0) allDocSentences.push(cleanedFullText);

        calculatedPageSentenceIndices.length = 0;
        calculatedPageSentenceIndices.push(0);
      }
      if (allDocSentences.length === 0) throw new Error("No processable text found in PDF after extensive processing.");

      setSentences(allDocSentences);
      const finalPageSentenceIndices = calculatedPageSentenceIndices.slice(0, docNumPages).map(idx => Math.min(idx, allDocSentences.length));
      setPageSentenceIndices(finalPageSentenceIndices.length > 0 ? finalPageSentenceIndices : [0]);

      setCurrentTextPage(1);
      const viewerBuffer = rawArrayBuffer.slice(0); setPdfDataForViewer({ data: viewerBuffer });
    } catch (error) {
      console.error('App: Error processing PDF client-side:', error);
      setPdfError(`PDF Processing Error: ${error.message || "Failed to extract text. The PDF might be image-based, corrupted, or have complex formatting."}`);
      setOriginalPdfFile(null); setPdfDataForViewer(null);
    } finally { setIsLoadingPdf(false); }
  };

  const handlePageChangeByViewer = (newViewerPage) => {
     if (isPlayingRef.current) {
        setIsPlaying(false);
     }
     setRsvpWordInterval(null);
     setCurrentTextPage(newViewerPage);
     const indices = pageSentenceIndicesRef.current;

     if (indices && newViewerPage >= 1 && newViewerPage <= indices.length) {
         const targetSentenceIndex = indices[newViewerPage - 1];
         if (targetSentenceIndex !== undefined && targetSentenceIndex < sentencesRef.current.length) {
             if(currentSentenceIndexRef.current !== targetSentenceIndex) setCurrentSentenceIndex(targetSentenceIndex);
         } else if (sentencesRef.current.length > 0) {
            if(currentSentenceIndexRef.current !== 0) setCurrentSentenceIndex(0);
         }
     } else if (sentencesRef.current.length > 0) {
        if(currentSentenceIndexRef.current !== 0) setCurrentSentenceIndex(0);
     }
     setCurrentWordInSentenceIndex(0);
  };

  const handleWPMChange = (newWpm) => { setWpm(Math.max(MIN_WPM_LIMIT, Math.min(MAX_WPM_LIMIT, newWpm))); };

  const restart = useCallback(() => {
    if (isLoadingPdf || sentencesRef.current.length === 0) return;
    setIsPlaying(false);
    setRsvpWordInterval(null);
    setCurrentSentenceIndex(0); setCurrentWordInSentenceIndex(0);
    setCurrentTextPage(1);
    setTimeout(() => setIsPlaying(true), 50);
  }, [isLoadingPdf]);

  const seekToSentence = useCallback((newSentenceIdx) => {
    if (isLoadingPdf || sentencesRef.current.length === 0) return;
    const clampedIndex = Math.max(0, Math.min(newSentenceIdx, sentencesRef.current.length - 1));
    setIsPlaying(false);
    setRsvpWordInterval(null);
    setCurrentSentenceIndex(clampedIndex);
    setCurrentWordInSentenceIndex(0);
  }, [isLoadingPdf]);

  const togglePlayPause = useCallback(() => {
    if (isLoadingPdf || sentencesRef.current.length === 0) {
      if (sentencesRef.current.length === 0 && !isLoadingPdf) setPdfError("Upload a PDF to start reading."); return;
    }
    if (currentSentenceIndexRef.current >= sentencesRef.current.length - 1 &&
        !isPlayingRef.current && sentencesRef.current.length > 0 &&
        currentWordInSentenceIndex >= (currentSentenceWordsMapRef.current?.length || 1) -1 ) {
      restart(); return;
    }
    setIsPlaying(prev => !prev);
  }, [isLoadingPdf, restart]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.ctrlKey || event.metaKey) {
        if (event.key === 'o') { event.preventDefault(); fileInputRef.current?.click(); } return;
      }
      const activeElement = document.activeElement;
      const isEditingText = activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'SELECT' || activeElement.tagName === 'TEXTAREA');

      if (isEditingText && activeElement.type === 'range' && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
      } else if (isEditingText && event.key === ' ') {
      } else {
        switch (event.key) {
          case ' ': event.preventDefault(); togglePlayPause(); break;
          case 'ArrowLeft': event.preventDefault(); seekToSentence(currentSentenceIndexRef.current - 1); break;
          case 'ArrowRight': event.preventDefault(); seekToSentence(currentSentenceIndexRef.current + 1); break;
          case 'r': case 'R': event.preventDefault(); restart(); break;
          default: break;
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePlayPause, seekToSentence, restart]);


  return (
    <div className="app-container">
      <header className="top-bar">
        <div className="main-controls-group">
            <FileUpload onFileUpload={handleFileUpload} disabled={isLoadingPdf} ref={fileInputRef} />
            <Controls
              isPlaying={isPlaying} onPlayPause={togglePlayPause}
              wpm={wpm} onWpmChange={handleWPMChange}
              onRestart={restart}
              hasContent={sentences.length > 0 && !isLoadingPdf}
              currentWordIndex={currentSentenceIndex}
              totalWords={sentences.length}
              onSeek={seekToSentence}
              disabled={isLoadingPdf || sentences.length === 0}
              minWpm={MIN_WPM_LIMIT}
              maxWpm={MAX_WPM_LIMIT}
            />
        </div>
        <button onClick={() => setIsSettingsPanelOpen(p => !p)} aria-expanded={isSettingsPanelOpen} aria-controls="settings-panel-main">
            {isSettingsPanelOpen ? 'Hide Settings' : 'Show Settings'}
        </button>
      </header>

      <ProgressBar current={currentSentenceIndex + 1} total={sentences.length} />

      {isLoadingPdf && <div className="loading-message" role="status">Processing PDF... Please wait.</div>}
      {pdfError && <div className="error-message" role="alert">{pdfError}</div>}

      <main className="main-content">
        <section className="pdf-panel" aria-labelledby="pdf-panel-heading">
            <h2 id="pdf-panel-heading" className="visually-hidden">PDF Document View</h2>
            <PDFViewer
                file={pdfDataForViewer}
                currentPageFromApp={currentTextPage}
                numPagesFromApp={numPages}
                onPageChangeByViewer={handlePageChangeByViewer}
            />
        </section>
        <div className="rsvp-main-panel">
            <section className="rsvp-panel" aria-labelledby="rsvp-panel-heading">
              <h2 id="rsvp-panel-heading" className="visually-hidden">RSVP Display</h2>
              <RSVPDisplay word={currentWordForRSVP} fontSize={fontSize} color={fontColor} backgroundColor={bgColor} />
            </section>
            {/* START MODIFICATION */}
            <aside
                id="settings-panel-main"
                className="settings-panel-container"
                style={{ display: isSettingsPanelOpen ? 'block' : 'none' }} // Control visibility with style
                role="region"
                aria-labelledby="settings-panel-title"
                aria-hidden={!isSettingsPanelOpen} // For accessibility
            >
                <h3 id="settings-panel-title" className="visually-hidden">Application Settings</h3>
                <SettingsPanel
                    fontSize={fontSize} onFontSizeChange={setFontSize}
                    fontColor={fontColor} onFontColorChange={setFontColor}
                    bgColor={bgColor} onBgColorChange={setBgColor}
                    isHighContrast={isHighContrast} onHighContrastToggle={() => setIsHighContrast(p => !p)}
                />
                <AmbientSoundPlayer /> {/* AmbientSoundPlayer is now always mounted when its parent <aside> is */}
            </aside>
            {/* END MODIFICATION */}
        </div>
      </main>
       {showPageTurnNotification && (
        <div className="page-turn-notification" aria-live="polite">
            Turning to Page {currentTextPage}...
        </div>
      )}
      <footer className="status-bar">
        {isLoadingPdf ? "Processing PDF..." : pdfError ? "PDF Error" : originalPdfFile ? `Reading: ${originalPdfFile.name}` : "No PDF loaded."}
        {sentences.length > 0 && !isLoadingPdf && !pdfError && ` - Sentence ${Math.min(currentSentenceIndex + 1, sentences.length)} of ${sentences.length} (Page ${currentTextPage} of ${numPages}) - Rate: ${wpm} WPM`}
        {isPlaying && !isLoadingPdf && !pdfError && " - Playing"}
        {!isPlaying && sentences.length > 0 && !isLoadingPdf && !pdfError && " - Paused"}
      </footer>
    </div>
  );
}
export default App;