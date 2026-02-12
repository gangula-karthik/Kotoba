import React, { useState, useEffect, useRef, useCallback } from "react";
import { MicVAD } from "@ricky0123/vad-web";
import AudioWave from "./components/AudioWave";
import Settings from "./components/Settings";

function getSystemTheme() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function applyTheme(theme) {
  const resolved = theme === "system" ? getSystemTheme() : theme;
  document.documentElement.classList.toggle("dark", resolved === "dark");
}

function getWindowMode() {
  const params = new URLSearchParams(window.location.search);
  return params.get("mode") || "dictation";
}

export default function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speechEndTimeout, setSpeechEndTimeout] = useState(null);
  const isSpeakingRef = useRef(false);
  const streamRef = useRef(null);
  const isRecordingRef = useRef(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const audioContextRef = useRef(null);
  const vadRef = useRef(null);
  const transcriptionRef = useRef("");

  const windowMode = getWindowMode();

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (speechEndTimeout) {
        clearTimeout(speechEndTimeout);
      }
    };
  }, [speechEndTimeout]);

  // Keep isRecordingRef in sync with isRecording state
  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  // Theme detection
  useEffect(() => {
    applyTheme("system");
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyTheme("system");
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  const startRecording = useCallback(async () => {
    if (isRecordingRef.current) return;
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      audioContextRef.current = audioCtx;

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      audioChunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      recorder.start(250);
      mediaRecorderRef.current = recorder;

      if (window.electronAPI) window.electronAPI.startRecording();
      setIsRecording(true);
      isSpeakingRef.current = false;
      setIsSpeaking(false);

      try {
        const vad = await MicVAD.new({
          baseAssetPath: "/",
          onnxWASMBasePath: "/",
          model: "v5",
          positiveSpeechThreshold: 0.9,
          negativeSpeechThreshold: 0.5,
          minSpeechFrames: 3,
          redemptionFrames: 5,
          getStream: async () => stream,
          pauseStream: async () => {},
          resumeStream: async () => stream,
          onSpeechStart: () => {
            isSpeakingRef.current = true;
            setIsSpeaking(true);
            if (mediaRecorderRef.current?.state === "paused") {
              mediaRecorderRef.current.resume();
            }
            // Clear any pending timeout when speech starts
            if (speechEndTimeout) {
              clearTimeout(speechEndTimeout);
              setSpeechEndTimeout(null);
            }
          },
          onSpeechEnd: () => {
            isSpeakingRef.current = false;
            setIsSpeaking(false);
            if (mediaRecorderRef.current?.state === "recording") {
              mediaRecorderRef.current.pause();
            }
            // Start timeout to auto-stop recording after 2 seconds of silence
            const timeout = setTimeout(() => {
              stopRecording();
            }, 2000);
            setSpeechEndTimeout(timeout);
          },
          onVADMisfire: () => {
            isSpeakingRef.current = false;
            setIsSpeaking(false);
            if (mediaRecorderRef.current?.state === "recording") {
              mediaRecorderRef.current.pause();
            }
          },
        });
        vadRef.current = vad;
        if (mediaRecorderRef.current?.state === "recording") {
          mediaRecorderRef.current.pause();
        }
      } catch (vadErr) {
        console.warn("VAD init failed, recording without VAD:", vadErr);
        isSpeakingRef.current = true;
        setIsSpeaking(true);
      }
    } catch (err) {
      console.error("Microphone access denied:", err);
    }
  }, []);

  const stopRecording = useCallback(async () => {
    if (!isRecordingRef.current) return;

    // Clear any pending speech end timeout
    if (speechEndTimeout) {
      clearTimeout(speechEndTimeout);
      setSpeechEndTimeout(null);
    }

    if (vadRef.current) {
      vadRef.current.destroy().catch(() => {});
      vadRef.current = null;
    }

    const recorder = mediaRecorderRef.current;
    let finalText = transcriptionRef.current || "";
    if (recorder && recorder.state !== "inactive") {
      const transcriptionDone = new Promise((resolve) => {
        recorder.onstop = async () => {
          const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType });
          console.log(
            `Audio recorded: ${(blob.size / 1024).toFixed(1)} KB, type: ${blob.mimeType}`
          );

          try {
            const arrayBuffer = await blob.arrayBuffer();
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

            const sampleRate = audioBuffer.sampleRate;
            const channelData = audioBuffer.getChannelData(0);

            let audioData = channelData;
            if (sampleRate !== 16000) {
              const ratio = 16000 / sampleRate;
              const newLength = Math.floor(channelData.length * ratio);
              audioData = new Float32Array(newLength);
              for (let i = 0; i < newLength; i++) {
                const srcIndex = i / ratio;
                const srcIndexInt = Math.floor(srcIndex);
                const fraction = srcIndex - srcIndexInt;
                if (srcIndexInt + 1 < channelData.length) {
                  audioData[i] =
                    channelData[srcIndexInt] * (1 - fraction) +
                    channelData[srcIndexInt + 1] * fraction;
                } else {
                  audioData[i] = channelData[srcIndexInt];
                }
              }
            }

            if (window.electronAPI) {
              const result = await window.electronAPI.transcribeAudio(audioData);
              if (result.success) {
                finalText = result.text;
                transcriptionRef.current = result.text;
                await window.electronAPI.setTranscription(result.text);
                console.log("Transcription:", result.text);
              } else {
                console.error("Transcription failed:", result.errorMessage);
                finalText = "";
                transcriptionRef.current = "";
                await window.electronAPI.setTranscription("");
              }
            }

            audioContext.close();
          } catch (error) {
            console.error("Error processing audio:", error);
          }

          audioChunksRef.current = [];
          resolve();
        };
      });
      recorder.stop();
      mediaRecorderRef.current = null;

      await transcriptionDone;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    setIsRecording(false);
    isSpeakingRef.current = false;
    setIsSpeaking(false);
    if (window.electronAPI) await window.electronAPI.stopAndPaste(finalText);
  }, []);

  const toggleRecording = useCallback(async () => {
    if (isRecordingRef.current) {
      stopRecording();
    } else {
      await startRecording();
    }
  }, [startRecording, stopRecording]);

  // Listen for toggle events from main process (legacy - no longer used)
  useEffect(() => {
    if (windowMode !== "dictation") return;
    if (!window.electronAPI) return;
    const cleanupToggle = window.electronAPI.onToggleRecording(() => {
      toggleRecording();
    });
    return () => cleanupToggle();
  }, [toggleRecording, windowMode]);

  // Option key hold to record (push-to-talk) - via main process global monitor
  useEffect(() => {
    if (windowMode !== "dictation") return;
    if (!window.electronAPI?.onOptionKeyDown) return;

    const cleanupDown = window.electronAPI.onOptionKeyDown(async () => {
      if (isRecordingRef.current) return;
      await window.electronAPI.captureFrontmostApp();
      startRecording();
    });
    const cleanupUp = window.electronAPI.onOptionKeyUp(() => {
      if (!isRecordingRef.current) return;
      stopRecording();
    });

    return () => {
      cleanupDown();
      cleanupUp();
    };
  }, [startRecording, stopRecording, windowMode]);

  // Force-stop from main process
  useEffect(() => {
    if (windowMode !== "dictation") return;
    if (!window.electronAPI?.onForceStop) return;
    const cleanup = window.electronAPI.onForceStop(() => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      setIsRecording(false);
    });
    return () => cleanup();
  }, [windowMode]);

  // --- Hover / click-through logic ---
  const handleMouseEnter = useCallback(() => {
    if (isRecordingRef.current) return;
    setIsHovered(true);
    if (window.electronAPI) {
      window.electronAPI.setIgnoreMouseEvents(false);
    }
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (isRecordingRef.current) return;
    setIsHovered(false);
    if (window.electronAPI) {
      window.electronAPI.setIgnoreMouseEvents(true, { forward: true });
    }
  }, []);

  const handleBarClick = useCallback(() => {
    toggleRecording();
  }, [toggleRecording]);

  // When recording stops, re-enable click-through if not hovered
  useEffect(() => {
    if (windowMode !== "dictation") return;
    if (!isRecording && !isHovered && window.electronAPI) {
      window.electronAPI.setIgnoreMouseEvents(true, { forward: true });
    }
  }, [isRecording, isHovered, windowMode]);

  // Settings window
  if (windowMode === "settings") {
    return <Settings />;
  }

  // Dictation bar
  const state = isRecording ? "recording" : isHovered ? "hover" : "idle";

  return (
    <div className="dictation-wrapper">
      <div
        className={`dictation-bar dictation-bar--${state}`}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={handleBarClick}
      >
        {state === "idle" && <div className="dictation-bar__idle-dot" />}

        {state === "hover" && (
          <span className="dictation-bar__hint">
            Click or hold <kbd>&#x2325;</kbd> to start
          </span>
        )}

        {state === "recording" && (
          <AudioWave isRecording={isRecording} isSpeaking={isSpeaking} isSpeakingRef={isSpeakingRef} stream={streamRef.current} audioContext={audioContextRef.current} />
        )}
      </div>
    </div>
  );
}
