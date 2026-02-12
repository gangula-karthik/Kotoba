const {
  app,
  BrowserWindow,
  ipcMain,
  nativeTheme,
  globalShortcut,
  Tray,
  Menu,
  nativeImage,
  screen,
  clipboard,
  session,
  systemPreferences,
} = require("electron");
const path = require("path");
const { exec } = require("child_process");

// Try to load the native C++ addon
let native = null;
try {
  native = require("../build/Release/openwisprflow_native.node");
  console.log("Native C++ addon loaded successfully");
} catch (err) {
  console.warn("Native addon not found. Run 'npm run native:build' to compile.");
  console.warn("Falling back to JS stubs.");
}

const isDev = !app.isPackaged;

let mainWindow = null;
let tray = null;

// ── Window creation ──────────────────────────────────────────────────

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 400,
    height: 70,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // Hide from Dock on macOS
  if (process.platform === "darwin") {
    app.dock.hide();
  }

  // Allow clicks to pass through transparent areas
  mainWindow.setIgnoreMouseEvents(true, { forward: true });

  // Keep window visible across all workspaces/spaces
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  // Pipe renderer console to terminal in dev
  if (isDev) {
    mainWindow.webContents.on("console-message", (_e, level, msg) => {
      const tag = ["LOG", "WARN", "ERR"][level] || "LOG";
      console.log(`[renderer:${tag}] ${msg}`);
    });
  }

  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  return mainWindow;
}

// ── Window positioning ───────────────────────────────────────────────

function positionWindowBottomCenter() {
  if (!mainWindow) return;
  const primaryDisplay = screen.getPrimaryDisplay();
  const { x, y, width, height } = primaryDisplay.workArea;

  const winBounds = mainWindow.getBounds();
  const newX = Math.round(x + (width - winBounds.width) / 2);
  // Just above the bottom edge, clearing the Dock
  const newY = Math.round(y + height - winBounds.height - 18);

  mainWindow.setPosition(newX, newY);
}

// ── Tray icon ────────────────────────────────────────────────────────

function createTray() {
  const icon = nativeImage.createFromNamedImage(
    "NSImageNameTouchBarRecordStartTemplate"
  );
  tray = new Tray(icon);
  tray.setToolTip("OpenWisprFlow - Dictation");

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Toggle Dictation",
      click: () => {
        if (mainWindow) mainWindow.webContents.send("dictation:toggle");
      },
    },
    {
      label: "Preferences",
      enabled: false,
    },
    { type: "separator" },
    {
      label: "Quit",
      click: () => app.quit(),
    },
  ]);

  tray.setContextMenu(contextMenu);
}

// ── Dictation State ────────────────────────────────────────────────

let isDictating = false;
let currentTranscription = "";

// ── Dictation Functions ─────────────────────────────────────────────

function startDictation() {
  if (isDictating) return;
  isDictating = true;
  currentTranscription = "";
  console.log("Dictation started");
  // TODO: Initialize C++ speech-to-text engine here
  if (native && native.startSpeechToText) {
    native.startSpeechToText();
  }
}

function stopDictation() {
  if (!isDictating) return;
  isDictating = false;
  console.log("Dictation stopped");
  // TODO: Stop C++ speech-to-text engine here
  if (native && native.stopSpeechToText) {
    native.stopSpeechToText();
  }
}

function getTranscription() {
  return currentTranscription;
}

// Mock function to simulate transcription updates (replace with actual C++ integration)
function simulateTranscription() {
  if (!isDictating) return;
  
  const sampleTexts = [
    "Hello, how are you today?",
    "This is a test of the speech to text system.",
    "The weather is beautiful outside.",
    "I hope you're enjoying this dictation feature.",
    "Let's see how well this works with longer sentences and more complex thoughts."
  ];
  
  const randomText = sampleTexts[Math.floor(Math.random() * sampleTexts.length)];
  currentTranscription = randomText;
  
  if (mainWindow) {
    // Send partial transcription first
    const words = randomText.split(' ');
    let partialText = '';
    words.forEach((word, index) => {
      setTimeout(() => {
        partialText += (index > 0 ? ' ' : '') + word;
        mainWindow.webContents.send("dictation:partial", partialText);
      }, index * 200);
    });
    
    // Send final transcription
    setTimeout(() => {
      mainWindow.webContents.send("dictation:transcription", randomText);
    }, words.length * 200 + 500);
  }
}

// ── IPC Handlers (dictation) ────────────────────────────────────────

ipcMain.handle("dictation:start", async () => {
  startDictation();
  return true;
});

ipcMain.handle("dictation:stop", async () => {
  stopDictation();
  return true;
});

ipcMain.handle("dictation:getTranscription", async () => {
  return getTranscription();
});

ipcMain.on("dictation:hide", () => {
  // No-op: window stays visible in always-on bar mode
});

// Allow renderer to toggle click-through for the bar hover area
ipcMain.on("window:set-ignore-mouse-events", (_event, ignore, opts) => {
  if (!mainWindow) return;
  mainWindow.setIgnoreMouseEvents(ignore, opts || {});
});

// Additional dictation IPC handlers
ipcMain.on("dictation:toggle", () => {
  if (isDictating) {
    stopDictation();
  } else {
    startDictation();
  }
});

ipcMain.handle("dictation:stopAndPaste", async () => {
  stopDictation();
  const text = getTranscription();
  if (text && text.trim()) {
    // Brief delay so focus returns to the previous app
    await new Promise((resolve) => setTimeout(resolve, 200));
    clipboard.writeText(text);
    if (process.platform === "darwin") {
      exec(
        'osascript -e \'tell application "System Events" to keystroke "v" using command down\''
      );
    }
  }
  return text;
});

// ── IPC Handlers (existing — kept for compatibility) ─────────────────

ipcMain.handle("native:ping", async () => {
  if (native && native.ping) return native.ping();
  return "pong (JS fallback — native addon not loaded)";
});

ipcMain.handle("native:getSystemInfo", async () => {
  if (native && native.getSystemInfo) return native.getSystemInfo();
  return {
    platform: process.platform,
    arch: process.arch,
    cpuCores: require("os").cpus().length,
    totalMemory: `${Math.round(require("os").totalmem() / 1073741824)} GB`,
    nativeAddon: false,
  };
});

ipcMain.handle("native:compute", async (_event, input) => {
  if (native && native.compute) return native.compute(input);
  return { result: input * 2, engine: "js-fallback" };
});

ipcMain.handle("app:getTheme", async () => {
  return nativeTheme.shouldUseDarkColors ? "dark" : "light";
});

ipcMain.handle("app:getPlatform", async () => {
  return process.platform;
});

// ── App Lifecycle ────────────────────────────────────────────────────

app.whenReady().then(async () => {
  // Grant microphone permission to the renderer process
  session.defaultSession.setPermissionRequestHandler(
    (_webContents, permission, callback) => {
      callback(permission === "media");
    }
  );
  session.defaultSession.setPermissionCheckHandler(
    (_webContents, permission) => {
      return permission === "media";
    }
  );

  // On macOS, request microphone access at the OS level
  if (process.platform === "darwin") {
    const micStatus = systemPreferences.getMediaAccessStatus("microphone");
    if (micStatus !== "granted") {
      const granted = await systemPreferences.askForMediaAccess("microphone");
      if (!granted) {
        console.warn("Microphone access was denied by the user");
      }
    }
  }

  createWindow();
  createTray();

  // Position at bottom center and show immediately
  positionWindowBottomCenter();
  mainWindow.showInactive();

  // Register global shortcut: Option+Space toggles recording
  const registered = globalShortcut.register("Alt+Space", () => {
    if (mainWindow) {
      mainWindow.webContents.send("dictation:toggle");
    }
  });

  if (!registered) {
    console.warn("Failed to register Alt+Space shortcut");
  }


  // Simulate transcription updates for testing (remove when C++ integration is ready)
  setInterval(() => {
    if (isDictating) {
      simulateTranscription();
    }
  }, 3000);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
