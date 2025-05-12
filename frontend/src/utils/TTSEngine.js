class TTSEngine {
  constructor() {
    this.speechSynthesis = window.speechSynthesis;
    this.utterance = null;
    this.apiSupported = !!this.speechSynthesis;
    this.isSpeaking = false;
    this.voicesLoaded = false;
    this.selectedVoice = null;
    this.currentOnEndCallback = null;
    this.currentOnBoundaryCallback = null; // New callback for word boundaries
    this.currentText = ""; 
    this.defaultPitch = 1.0;

    if (!this.apiSupported) {
      console.error("TTSEngine: Web Speech API (SpeechSynthesis) is not supported by this browser.");
      return;
    }

    this.boundHandleVoicesChanged = this._handleVoicesChanged.bind(this);
    this._initializeUtterance();
    this.loadVoices();
  }

  _initializeUtterance() {
    if (!this.apiSupported) return;
    this.utterance = new SpeechSynthesisUtterance();
    this.utterance.lang = 'en-US';
    this.utterance.pitch = this.defaultPitch;

    this.utterance.onstart = () => {
      this.isSpeaking = true;
      // console.log(`TTS Start: "${this.utterance.text}", Pitch: ${this.utterance.pitch}, Rate: ${this.utterance.rate}`);
    };

    this.utterance.onend = () => {
      this.isSpeaking = false;
      const callback = this.currentOnEndCallback;
      this.currentOnEndCallback = null;
      this.currentOnBoundaryCallback = null; // Clear boundary callback on end too
      if (typeof callback === 'function') {
        try {
          callback();
        } catch (e) {
          console.error("TTSEngine: Error executing onEndCallback:", e);
        }
      }
    };

    this.utterance.onerror = (event) => {
      console.error('%cTTSEngine onerror:', "color: red; font-weight: bold;", {
        error: event.error, text: this.currentText || this.utterance?.text, eventObj: event
      });
      this.isSpeaking = false;
      const callback = this.currentOnEndCallback;
      this.currentOnEndCallback = null;
      this.currentOnBoundaryCallback = null; // Clear boundary callback on error
      if (typeof callback === 'function') {
        console.warn("%cTTSEngine onerror: Attempting to call onEndCallback due to error.", "color: orange;");
        try {
          callback();
        } catch (e) {
          console.error("TTSEngine: Error executing onEndCallback from onerror:", e);
        }
      }
    };

    this.utterance.onboundary = (event) => {
      // console.log(`TTS Boundary: Type: ${event.name}, CharIndex: ${event.charIndex}, Name: ${event.name}`);
      if (event.name === 'word' && this.currentOnBoundaryCallback) { // Only process 'word' boundaries
        this.currentOnBoundaryCallback(event.charIndex, event.charLength);
      }
    };
  }

  _handleVoicesChanged() {
    // ... (same as before, ensure good voice selection) ...
    if (!this.apiSupported) return;
    const voices = this.speechSynthesis.getVoices();
    if (voices.length > 0) {
      this.voicesLoaded = true;
      let foundVoice =
        voices.find(voice => voice.lang.startsWith('en') && voice.localService && voice.name.toLowerCase().includes('google')) ||
        voices.find(voice => voice.lang.startsWith('en') && voice.localService && (voice.name.toLowerCase().includes('microsoft') || voice.name.toLowerCase().includes('apple') || voice.name.toLowerCase().includes('zira') || voice.name.toLowerCase().includes('david'))) ||
        voices.find(voice => voice.lang.startsWith('en') && voice.localService) ||
        voices.find(voice => voice.lang.startsWith('en') && voice.name.toLowerCase().includes('google')) ||
        voices.find(voice => voice.lang.startsWith('en') && (voice.name.toLowerCase().includes('microsoft') || voice.name.toLowerCase().includes('apple'))) ||
        voices.find(voice => voice.lang.startsWith('en')) ||
        voices.find(voice => voice.localService) ||
        voices[0];

      if (foundVoice) {
        this.selectedVoice = foundVoice;
        if (this.utterance) this.utterance.voice = this.selectedVoice;
        console.log("TTSEngine: Voice selected:", this.selectedVoice.name, `(${this.selectedVoice.lang})`);
      } else {
        console.warn("TTSEngine: No suitable voice found, will use browser default.");
      }
    } else {
      console.warn("TTSEngine: getVoices() returned an empty list.");
    }
  }

  loadVoices() { /* ... (same as before) ... */ 
    if (!this.apiSupported) return;
    const voices = this.speechSynthesis.getVoices();
    if (voices.length > 0 && !this.voicesLoaded) {
      this._handleVoicesChanged();
    } else if (!this.voicesLoaded) {
      this.speechSynthesis.addEventListener('voiceschanged', this.boundHandleVoicesChanged, { once: true });
    }
  }

  // WPM now primarily affects rate. Inter-sentence delay is handled by App.jsx if desired.
  calculateRate(wpm) {
    const baseWPMAtRateOne = 160; // Adjusted for sentence-level speaking, might need tuning
    const minApiRate = 0.5;
    const maxApiRate = 2.5; // Slightly reduced max rate for sentences to maintain clarity
    if (wpm <= 0) return minApiRate;
    let calculatedApiRate = wpm / baseWPMAtRateOne;
    return Math.max(minApiRate, Math.min(maxApiRate, calculatedApiRate));
  }

  speak(sentence, wpm, volume = 1, pitch = 1.0, onEndCallback = null, onBoundaryCallback = null) {
    if (!this.apiSupported || !this.utterance) {
      console.warn("TTSEngine Speak: API not supported or utterance not initialized.");
      if (typeof onEndCallback === 'function') queueMicrotask(onEndCallback);
      return;
    }

    const trimmedSentence = String(sentence).trim();
    this.currentText = trimmedSentence;
    this.currentOnBoundaryCallback = onBoundaryCallback; 

    if (!trimmedSentence) {
      if (typeof onEndCallback === 'function') {
          queueMicrotask(onEndCallback);
      }
      return;
    }
    
    this.currentOnEndCallback = onEndCallback;

    if (this.speechSynthesis.speaking || this.speechSynthesis.pending) {
      this.speechSynthesis.cancel(); 
      this.currentOnEndCallback = onEndCallback; 
      this.currentOnBoundaryCallback = onBoundaryCallback;
    }

    this.utterance.text = trimmedSentence;
    this.utterance.rate = this.calculateRate(wpm); // WPM still sets the overall rate
    this.utterance.volume = Math.max(0, Math.min(1, volume));
    this.utterance.pitch = Math.max(0, Math.min(2, pitch));
    this.utterance.lang = 'en-US';

    if (this.selectedVoice) {
      this.utterance.voice = this.selectedVoice;
    } else if (!this.voicesLoaded) {
      this.loadVoices();
    }

    try {
      this.speechSynthesis.speak(this.utterance);
    } catch (e) {
      console.error("TTSEngine: Error calling speechSynthesis.speak():", e);
      this.isSpeaking = false;
      const cb = this.currentOnEndCallback;
      this.currentOnEndCallback = null;
      this.currentOnBoundaryCallback = null;
      if (typeof cb === 'function') {
         queueMicrotask(cb);
      }
    }
  }

  pause() { /* ... (same) ... */ 
    if (this.apiSupported && this.speechSynthesis && this.speechSynthesis.speaking) {
      this.speechSynthesis.pause();
    }
  }
  resume() { /* ... (same) ... */ 
    if (this.apiSupported && this.speechSynthesis && this.speechSynthesis.paused) {
      this.speechSynthesis.resume();
    }
  }
  cancel() { /* ... (same, ensure boundary callback is also cleared) ... */ 
    if (this.apiSupported && this.speechSynthesis) {
      this.currentOnEndCallback = null; 
      this.currentOnBoundaryCallback = null;
      this.speechSynthesis.cancel(); 
      this.isSpeaking = false; 
    }
  }
}

export default TTSEngine;