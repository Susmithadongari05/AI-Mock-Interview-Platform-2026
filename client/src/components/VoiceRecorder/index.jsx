import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';

import './index.css';


const MAX_RECORD_TIME = 300;


const formatTime = (seconds) => {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  return `${String(minutes).padStart(2, '0')}:${String(
    remainingSeconds
  ).padStart(2, '0')}`;
};


const VoiceRecorder = ({
  onRecordingComplete,
  disabled = false,
}) => {

  const [isRecording, setIsRecording] =
    useState(false);

  const [recordingTime, setRecordingTime] =
    useState(0);

  const [recordedBlob, setRecordedBlob] =
    useState(null);

  const [audioPreviewUrl, setAudioPreviewUrl] =
    useState(null);

  const [isSupported, setIsSupported] =
    useState(true);


  const mediaRecorderRef =
    useRef(null);

  const streamRef =
    useRef(null);

  const chunksRef =
    useRef([]);


  // ============================================
  // CHECK BROWSER SUPPORT
  // ============================================

  useEffect(() => {

    if (
      !navigator.mediaDevices ||
      !navigator.mediaDevices.getUserMedia ||
      !window.MediaRecorder
    ) {
      setIsSupported(false);
    }

  }, []);


  // ============================================
  // RECORDING TIMER
  // ============================================

  useEffect(() => {

    let timerId = null;


    if (isRecording) {

      timerId = setInterval(() => {

        setRecordingTime((previousTime) => {

          if (
            previousTime + 1 >=
            MAX_RECORD_TIME
          ) {

            stopRecording();

            toast.success(
              'Maximum recording time reached (5 minutes).'
            );

            return MAX_RECORD_TIME;
          }


          return previousTime + 1;
        });

      }, 1000);

    }


    return () => {

      if (timerId) {
        clearInterval(timerId);
      }

    };

  }, [isRecording]);


  // ============================================
  // CLEANUP
  // ============================================

  useEffect(() => {

    return () => {

      if (
        mediaRecorderRef.current &&
        mediaRecorderRef.current.state !==
          'inactive'
      ) {

        mediaRecorderRef.current.stop();
      }


      if (streamRef.current) {

        streamRef.current
          .getTracks()
          .forEach((track) => track.stop());
      }


      if (audioPreviewUrl) {

        URL.revokeObjectURL(
          audioPreviewUrl
        );
      }

    };

  }, [audioPreviewUrl]);


  // ============================================
  // START RECORDING
  // ============================================

  const startRecording = async () => {

    try {

      if (disabled) {
        return;
      }


      if (!isSupported) {

        toast.error(
          'Your browser does not support audio recording.'
        );

        return;
      }


      if (audioPreviewUrl) {

        URL.revokeObjectURL(
          audioPreviewUrl
        );
      }


      setRecordedBlob(null);

      setAudioPreviewUrl(null);

      setRecordingTime(0);


      const stream =
        await navigator.mediaDevices.getUserMedia({
          audio: true,
        });


      streamRef.current = stream;


      const preferredTypes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
        'audio/ogg;codecs=opus',
      ];

      const mimeType = preferredTypes.find(
        (type) => MediaRecorder.isTypeSupported(type)
      );

      // No preferred type supported: let the browser choose its default.
      const recorder =
        new MediaRecorder(
          stream,
          mimeType ? { mimeType } : undefined
        );


      chunksRef.current = [];


      recorder.ondataavailable = (
        event
      ) => {

        if (event.data.size > 0) {

          chunksRef.current.push(
            event.data
          );
        }

      };


      recorder.onstop = () => {

        // Use the type the browser actually recorded (Chrome/Firefox: webm/ogg, Safari: mp4).
        const audioBlob =
          new Blob(
            chunksRef.current,
            {
              type:
                recorder.mimeType ||
                chunksRef.current[0]?.type ||
                'audio/webm',
            }
          );


        setRecordedBlob(
          audioBlob
        );


        const previewUrl =
          URL.createObjectURL(
            audioBlob
          );


        setAudioPreviewUrl(
          previewUrl
        );


        if (streamRef.current) {

          streamRef.current
            .getTracks()
            .forEach(
              (track) =>
                track.stop()
            );

          streamRef.current = null;
        }

      };


      recorder.onerror = () => {

        toast.error(
          'An error occurred while recording.'
        );

        setIsRecording(false);

      };


      mediaRecorderRef.current =
        recorder;


      recorder.start();


      setIsRecording(true);

      setRecordingTime(0);


    } catch (error) {

      console.error(
        'Microphone access error:',
        error
      );


      if (
        streamRef.current
      ) {

        streamRef.current
          .getTracks()
          .forEach(
            (track) =>
              track.stop()
          );

        streamRef.current = null;
      }


      toast.error(
        'Could not access microphone. Please allow microphone permissions.'
      );

    }

  };


  // ============================================
  // STOP RECORDING
  // ============================================

  const stopRecording = () => {

    const recorder =
      mediaRecorderRef.current;


    if (
      recorder &&
      recorder.state !== 'inactive'
    ) {

      recorder.stop();
    }


    setIsRecording(false);

  };


  // ============================================
  // SUBMIT RECORDING
  // ============================================

  const handleSubmit = () => {

    if (!recordedBlob) {

      toast.error(
        'Please record an answer first.'
      );

      return;
    }


    if (
      typeof onRecordingComplete ===
      'function'
    ) {

      onRecordingComplete(
        recordedBlob
      );

    }


    setRecordedBlob(null);


    if (audioPreviewUrl) {

      URL.revokeObjectURL(
        audioPreviewUrl
      );

      setAudioPreviewUrl(null);
    }


    setRecordingTime(0);

  };


  // ============================================
  // RE-RECORD
  // ============================================

  const handleReRecord = () => {

    if (audioPreviewUrl) {

      URL.revokeObjectURL(
        audioPreviewUrl
      );
    }


    setRecordedBlob(null);

    setAudioPreviewUrl(null);

    setRecordingTime(0);

  };


  // ============================================
  // UNSUPPORTED BROWSER
  // ============================================

  if (!isSupported) {

    return (
      <div className="voice-recorder">

        <div className="voice-recorder-error">

          <p>
            Your browser does not support
            audio recording.
          </p>

          <p>
            Please use Google Chrome or
            Microsoft Edge.
          </p>

        </div>

      </div>
    );

  }


  // ============================================
  // UI
  // ============================================

  return (
    <div className="voice-recorder">


      {/* RECORDING STATE */}

      {isRecording && (

        <div className="voice-recorder-recording">

          <div className="voice-recorder-pulse">
            ●
          </div>


          <div className="voice-recorder-recording-info">

            <span className="voice-recorder-recording-label">
              Recording...
            </span>

            <span className="voice-recorder-timer">
              {formatTime(recordingTime)}
            </span>

          </div>


          <button
            type="button"
            className="voice-recorder-stop-button"
            onClick={stopRecording}
          >
            Stop Recording
          </button>

        </div>

      )}


      {/* IDLE STATE */}

      {!isRecording &&
        !recordedBlob && (

        <div className="voice-recorder-idle">

          <button
            type="button"
            className="voice-recorder-record-button"
            onClick={startRecording}
            disabled={disabled}
          >

            <span className="voice-recorder-mic-icon">
              🎙️
            </span>

            <span>
              Start Recording
            </span>

          </button>


          <p className="voice-recorder-help-text">
            Click to start recording your
            answer
          </p>

          <p className="voice-recorder-limit-text">
            Maximum recording time: 5 minutes
          </p>

        </div>

      )}


      {/* PREVIEW STATE */}

      {!isRecording &&
        recordedBlob && (

        <div className="voice-recorder-preview">

          <div className="voice-recorder-preview-header">

            <span className="voice-recorder-preview-title">
              Your recording is ready
            </span>

            <span className="voice-recorder-preview-time">
              {formatTime(recordingTime)}
            </span>

          </div>


          {audioPreviewUrl && (

            <audio
              className="voice-recorder-audio"
              src={audioPreviewUrl}
              controls
            />

          )}


          <div className="voice-recorder-preview-actions">

            <button
              type="button"
              className="voice-recorder-rerecord-button"
              onClick={
                handleReRecord
              }
              disabled={disabled}
            >
              Record Again
            </button>


            <button
              type="button"
              className="voice-recorder-submit-button"
              onClick={
                handleSubmit
              }
              disabled={disabled}
            >
              Submit Answer
            </button>

          </div>

        </div>

      )}

    </div>
  );
};


export default VoiceRecorder;