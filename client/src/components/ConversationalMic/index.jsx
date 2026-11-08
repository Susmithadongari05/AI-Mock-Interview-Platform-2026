
import { useEffect, useRef, useState } from 'react';
import { BsMicFill } from 'react-icons/bs';
import './index.css';

function ConversationalMic({ onTranscriptReady, disabled = false }) {
  const [isListening, setIsListening] = useState(false);
  const [finalText, setFinalText] = useState('');
  const [liveText, setLiveText] = useState('');
  const [isSupported, setIsSupported] = useState(true);

  const recognitionRef = useRef(null);
  const finalTextRef = useRef('');
  const interimTextRef = useRef('');
  const shouldListenRef = useRef(false);
  const restartTimerRef = useRef(null);

  const stopListening = () => {
    shouldListenRef.current = false;
    setIsListening(false);

    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }

    try {
      recognitionRef.current?.stop();
    } catch (error) {
      console.error('Stop recognition error:', error);
    }
  };

  const startListening = () => {
    if (disabled || !recognitionRef.current) return;

    finalTextRef.current = '';
    interimTextRef.current = '';
    setFinalText('');
    setLiveText('');

    shouldListenRef.current = true;

    try {
      recognitionRef.current.start();
      setIsListening(true);
    } catch (error) {
      console.error('Start recognition error:', error);
    }
  };

  const useTranscript = () => {
    const text = [
      finalTextRef.current,
      interimTextRef.current,
    ]
      .filter(Boolean)
      .join(' ')
      .trim();

    if (!text) return;

    onTranscriptReady?.(text);
    stopListening();
  };

  useEffect(() => {
    const SpeechRecognition =
      window.SpeechRecognition ||
      window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setIsSupported(false);
      return;
    }

    const recognition = new SpeechRecognition();

    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      let newFinalText = '';
      let newInterimText = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0].transcript.trim();

        if (result.isFinal) {
          newFinalText += transcript + ' ';
        } else {
          newInterimText += transcript + ' ';
        }
      }

      if (newFinalText) {
        finalTextRef.current = (
          finalTextRef.current + ' ' + newFinalText
        )
          .replace(/\s+/g, ' ')
          .trim();

        setFinalText(finalTextRef.current);
      }

      interimTextRef.current = newInterimText.trim();
      setLiveText(interimTextRef.current);
    };

    recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);

      if (
        event.error === 'not-allowed' ||
        event.error === 'service-not-allowed' ||
        event.error === 'audio-capture'
      ) {
        shouldListenRef.current = false;
        setIsListening(false);
      }
    };

    recognition.onend = () => {
      if (shouldListenRef.current && !disabled) {
        restartTimerRef.current = setTimeout(() => {
          try {
            recognition.start();
          } catch (error) {
            console.error('Recognition restart error:', error);
          }
        }, 300);
      } else {
        setIsListening(false);
      }
    };

    recognitionRef.current = recognition;

    return () => {
      shouldListenRef.current = false;

      if (restartTimerRef.current) {
        clearTimeout(restartTimerRef.current);
      }

      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;

      try {
        recognition.stop();
      } catch (error) {
        // Recognition may already be stopped.
      }

      recognitionRef.current = null;
    };
  }, [disabled]);

  useEffect(() => {
    if (disabled) {
      stopListening();
    }
  }, [disabled]);

  if (!isSupported) {
    return (
      <div className="cm-unsupported">
        Voice recognition is not supported. Please use Chrome or Edge.
      </div>
    );
  }

  const displayText = [finalText, liveText]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="cm-container">
      <div className="cm-mic-button-wrapper">
        <button
          type="button"
          className={`cm-mic-button ${
            isListening ? 'cm-mic-active' : ''
          }`}
          onClick={isListening ? stopListening : startListening}
          disabled={disabled}
        >
          <BsMicFill className="cm-mic-icon" />
        </button>
      </div>

      <div className="cm-status">
        {isListening ? (
          <p className="cm-status-listening">Listening...</p>
        ) : (
          <p className="cm-status-ready">Ready to listen</p>
        )}
      </div>

      {displayText && (
        <div className="cm-transcript-box">
          <span className="cm-transcript-final">{finalText}</span>
          {liveText && (
            <span className="cm-transcript-interim">
              {finalText ? ' ' : ''}
              {liveText}
            </span>
          )}
        </div>
      )}

      <div className="cm-controls">
        {isListening ? (
          <button
            type="button"
            className="cm-submit-btn"
            onClick={useTranscript}
            disabled={!displayText || disabled}
          >
            Use Transcript
          </button>
        ) : (
          <div className="cm-done-actions">
            <button
              type="button"
              className="cm-speak-again-btn"
              onClick={startListening}
              disabled={disabled}
            >
              Speak Again
            </button>

            <button
              type="button"
              className="cm-submit-btn"
              onClick={useTranscript}
              disabled={!displayText || disabled}
            >
              Use Transcript
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default ConversationalMic;
