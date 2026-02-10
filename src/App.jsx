import React, { useState, useEffect, useRef, useCallback } from "react";
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
  const streamRef = useRef(null);
  const isRecordingRef = useRef(false);

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
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      if (window.electronAPI) window.electronAPI.startRecording();
      setIsRecording(true);
    } catch (err) {
      console.error("Microphone access denied:", err);
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (!isRecordingRef.current) return;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setIsRecording(false);
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
          <AudioWave isRecording={isRecording} stream={streamRef.current} />
        )}
      </div>
    </div>
  );
}
