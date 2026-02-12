import React, { useState, useEffect, useRef, useCallback } from "react";
import { MicVAD } from "@ricky0123/vad-web";
import AudioWave from "./components/AudioWave";

function getSystemTheme() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function applyTheme(theme) {
  const resolved = theme === "system" ? getSystemTheme() : theme;
  document.documentElement.classList.toggle("dark", resolved === "dark");
}

export default function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const isSpeakingRef = useRef(false);
  const streamRef = useRef(null);
  const isRecordingRef = useRef(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const audioContextRef = useRef(null);
  const vadRef = useRef(null);

  // Keep ref in sync with state
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
      // Create AudioContext inside user gesture so it starts in "running" state
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      audioContextRef.current = audioCtx;

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Start capturing audio data
      audioChunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      recorder.start(250); // collect chunks every 250ms
      mediaRecorderRef.current = recorder;

      if (window.electronAPI) window.electronAPI.startRecording();
      setIsRecording(true);
      isSpeakingRef.current = false;
      setIsSpeaking(false); // start paused, VAD will activate on real speech

      // Initialize VAD for auto pause/resume
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
            isSpeakingRef.current = true; // instant — read by animation loop
            setIsSpeaking(true); // triggers opacity transition
            if (mediaRecorderRef.current?.state === "paused") {
              mediaRecorderRef.current.resume();
            }
          },
          onSpeechEnd: () => {
            isSpeakingRef.current = false;
            setIsSpeaking(false);
            if (mediaRecorderRef.current?.state === "recording") {
              mediaRecorderRef.current.pause();
            }
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
        // Pause recorder now that VAD is ready — let VAD resume on speech
        if (mediaRecorderRef.current?.state === "recording") {
          mediaRecorderRef.current.pause();
        }
      } catch (vadErr) {
        console.warn("VAD init failed, recording without VAD:", vadErr);
        isSpeakingRef.current = true;
        setIsSpeaking(true); // fallback: record everything if VAD fails
      }
    } catch (err) {
      console.error("Microphone access denied:", err);
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (!isRecordingRef.current) return;

    // Destroy VAD first (before stopping the stream it depends on)
    if (vadRef.current) {
      vadRef.current.destroy().catch(() => {});
      vadRef.current = null;
    }

    // Stop the MediaRecorder and collect final audio
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType });
        console.log(
          `Audio recorded: ${(blob.size / 1024).toFixed(1)} KB, type: ${blob.mimeType}`
        );
        audioChunksRef.current = [];
      };
      recorder.stop();
      mediaRecorderRef.current = null;
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
    if (window.electronAPI) window.electronAPI.stopAndPaste();
  }, []);

  const toggleRecording = useCallback(async () => {
    if (isRecordingRef.current) {
      stopRecording();
    } else {
      await startRecording();
    }
  }, [startRecording, stopRecording]);

  // Listen for toggle events from main process (Alt+Space) — stable, never re-registers
  useEffect(() => {
    if (!window.electronAPI) return;
    const cleanupToggle = window.electronAPI.onToggleRecording(() => {
      toggleRecording();
    });
    return () => cleanupToggle();
  }, [toggleRecording]);

  // Option key hold to record (push-to-talk)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Alt" && !isRecordingRef.current) {
        e.preventDefault();
        startRecording();
      }
    };
    const handleKeyUp = (e) => {
      if (e.key === "Alt" && isRecordingRef.current) {
        e.preventDefault();
        stopRecording();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [startRecording, stopRecording]);

  // Force-stop from main process
  useEffect(() => {
    if (!window.electronAPI?.onForceStop) return;
    const cleanup = window.electronAPI.onForceStop(() => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      setIsRecording(false);
    });
    return () => cleanup();
  }, []);

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
    if (!isRecording && !isHovered && window.electronAPI) {
      window.electronAPI.setIgnoreMouseEvents(true, { forward: true });
    }
  }, [isRecording, isHovered]);

  // Determine visual state
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
            Click or hold <kbd>⌥</kbd> to start
          </span>
        )}

        {state === "recording" && (
          <AudioWave isRecording={isRecording} isSpeaking={isSpeaking} isSpeakingRef={isSpeakingRef} stream={streamRef.current} audioContext={audioContextRef.current} />
        )}
      </div>
    </div>
  );
}
