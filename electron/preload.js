const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  // Dictation APIs
  startRecording: () => ipcRenderer.invoke("dictation:start"),
  stopRecording: () => ipcRenderer.invoke("dictation:stop"),
  stopAndPaste: (text) => ipcRenderer.invoke("dictation:stopAndPaste", text),
  getTranscription: () => ipcRenderer.invoke("dictation:getTranscription"),
  hideWindow: () => ipcRenderer.send("dictation:hide"),
  setIgnoreMouseEvents: (ignore, opts) =>
    ipcRenderer.send("window:set-ignore-mouse-events", ignore, opts),

  // Main-to-renderer event listeners
  onTranscription: (callback) => {
    const handler = (_event, text) => callback(text);
    ipcRenderer.on("dictation:transcription", handler);
    return () => ipcRenderer.removeListener("dictation:transcription", handler);
  },
  onPartialTranscription: (callback) => {
    const handler = (_event, text) => callback(text);
    ipcRenderer.on("dictation:partial", handler);
    return () => ipcRenderer.removeListener("dictation:partial", handler);
  },
  onToggleRecording: (callback) => {
    const handler = () => callback();
    ipcRenderer.on("dictation:toggle", handler);
    return () => ipcRenderer.removeListener("dictation:toggle", handler);
  },
  onForceStop: (callback) => {
    const handler = () => callback();
    ipcRenderer.on("dictation:force-stop", handler);
    return () => ipcRenderer.removeListener("dictation:force-stop", handler);
  },

  // Native C++ backend calls
  ping: () => ipcRenderer.invoke("native:ping"),
  getSystemInfo: () => ipcRenderer.invoke("native:getSystemInfo"),
  compute: (input) => ipcRenderer.invoke("native:compute", input),

  // Whisper speech-to-text APIs
  initWhisper: (modelPath) => ipcRenderer.invoke("whisper:init", modelPath),
  transcribeAudio: (audioData) => ipcRenderer.invoke("whisper:transcribe", audioData),
  setTranscription: (text) => ipcRenderer.invoke("whisper:setTranscription", text),
  cleanupWhisper: () => ipcRenderer.invoke("whisper:cleanup"),

  // App-level queries
  getTheme: () => ipcRenderer.invoke("app:getTheme"),
  getPlatform: () => ipcRenderer.invoke("app:getPlatform"),

  // Onboarding & Settings APIs
  getPermissions: () => ipcRenderer.invoke("onboarding:getPermissions"),
  requestMicrophone: () => ipcRenderer.invoke("onboarding:requestMicrophone"),
  requestAccessibility: () => ipcRenderer.invoke("onboarding:requestAccessibility"),
  getSettings: () => ipcRenderer.invoke("settings:get"),
  setSettings: (settings) => ipcRenderer.invoke("settings:set", settings),
  completeOnboarding: (settings) => ipcRenderer.invoke("onboarding:complete", settings),
  isOnboarding: () => ipcRenderer.invoke("onboarding:isOnboarding"),
});
