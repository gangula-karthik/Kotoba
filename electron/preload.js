const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  // Dictation APIs
  startRecording: () => ipcRenderer.invoke("dictation:start"),
  stopRecording: () => ipcRenderer.invoke("dictation:stop"),
  stopAndPaste: (text) => ipcRenderer.invoke("dictation:stopAndPaste", text),
  getTranscription: () => ipcRenderer.invoke("dictation:getTranscription"),
  captureFrontmostApp: () => ipcRenderer.invoke("dictation:captureFrontmostApp"),
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
  onOptionKeyDown: (callback) => {
    const handler = () => callback();
    ipcRenderer.on("option-key:down", handler);
    return () => ipcRenderer.removeListener("option-key:down", handler);
  },
  onOptionKeyUp: (callback) => {
    const handler = () => callback();
    ipcRenderer.on("option-key:up", handler);
    return () => ipcRenderer.removeListener("option-key:up", handler);
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

  // Permissions
  getPermissions: () => ipcRenderer.invoke("permissions:get"),
  requestMicrophone: () => ipcRenderer.invoke("permissions:requestMicrophone"),
  requestAccessibility: () => ipcRenderer.invoke("permissions:requestAccessibility"),

  // Settings
  getSettings: () => ipcRenderer.invoke("settings:get"),
  setSettings: (settings) => ipcRenderer.invoke("settings:set", settings),
  openSettings: () => ipcRenderer.invoke("settings:openWindow"),
});
