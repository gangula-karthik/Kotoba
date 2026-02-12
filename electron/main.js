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
  Notification,
  shell,
} = require("electron");
const path = require("path");
const fs = require("fs");
const { exec, execSync, execFileSync } = require("child_process");

// Try to load the native C++ addon
let native = null;
try {
  native = require("../build/Release/koto_native.node");
  console.log("Native C++ addon loaded successfully");
} catch (err) {
  console.warn("Native addon not found. Run 'npm run native:build' to compile.");
  console.warn("Falling back to JS stubs.");
}

const isDev = !app.isPackaged;

let mainWindow = null; // dictation bar (always running)
let settingsWindow = null; // settings window (opened on demand)
let tray = null;

// ── Settings store ──────────────────────────────────────────────────

function getSettingsPath() {
  return path.join(app.getPath("userData"), "settings.json");
}

function loadSettings() {
  try {
    const data = fs.readFileSync(getSettingsPath(), "utf8");
    return JSON.parse(data);
  } catch {
    return { language: "en" };
  }
}

function saveSettings(settings) {
  const current = loadSettings();
  const merged = { ...current, ...settings };
  fs.writeFileSync(getSettingsPath(), JSON.stringify(merged, null, 2));
  return merged;
}

// ── Window creation ──────────────────────────────────────────────────

function createDictationWindow() {
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
    show: false,
    focusable: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // Ensure the overlay stays above other windows.
  enforceDictationOverlayZOrder();

  // Allow clicks to pass through transparent areas
  mainWindow.setIgnoreMouseEvents(true, { forward: true });

  // Ensure window doesn't accept keyboard focus
  mainWindow.setFocusable(false);
  mainWindow.setSkipTaskbar(true);

  // Keep window visible across all workspaces/spaces
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  // Re-assert after flags are applied.
  enforceDictationOverlayZOrder();

  // Pipe renderer console to terminal in dev
  if (isDev) {
    mainWindow.webContents.on("console-message", (_e, level, msg) => {
      const tag = ["LOG", "WARN", "ERR"][level] || "LOG";
      console.log(`[renderer:${tag}] ${msg}`);
    });
  }

  if (isDev) {
    mainWindow.loadURL("http://localhost:5173?mode=dictation");
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"), {
      query: { mode: "dictation" },
    });
  }

  return mainWindow;
}

function createSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    return settingsWindow;
  }

  settingsWindow = new BrowserWindow({
    width: 480,
    height: 520,
    frame: false,
    transparent: false,
    alwaysOnTop: false,
    skipTaskbar: false,
    resizable: false,
    movable: true,
    hasShadow: true,
    show: false,
    focusable: true,
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#252525" : "#ffffff",
    titleBarStyle: "hiddenInset",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // Pipe renderer console to terminal in dev
  if (isDev) {
    settingsWindow.webContents.on("console-message", (_e, level, msg) => {
      const tag = ["LOG", "WARN", "ERR"][level] || "LOG";
      console.log(`[settings:${tag}] ${msg}`);
    });
  }

  if (isDev) {
    settingsWindow.loadURL("http://localhost:5173?mode=settings");
  } else {
    settingsWindow.loadFile(path.join(__dirname, "../dist/index.html"), {
      query: { mode: "settings" },
    });
  }

  settingsWindow.once("ready-to-show", () => {
    settingsWindow.center();
    settingsWindow.show();
  });

  settingsWindow.on("closed", () => {
    settingsWindow = null;
  });

  return settingsWindow;
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
  let icon;
  const iconPath = path.join(__dirname, "../assets/tray-icon.png");
  try {
    icon = nativeImage.createFromPath(iconPath);
  } catch (error) {
    console.warn("Tray icon file not found at", iconPath, "using fallback");
    if (process.platform === "darwin") {
      icon = nativeImage.createFromNamedImage(
        "NSImageNameTouchBarRecordStartTemplate"
      );
    } else {
      console.warn("No suitable tray icon for platform:", process.platform);
      return;
    }
  }
  tray = new Tray(icon);
  tray.setToolTip("Koto - Dictation");

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Toggle Dictation",
      click: () => {
        if (mainWindow) mainWindow.webContents.send("dictation:toggle");
      },
    },
    {
      label: "Settings",
      click: () => {
        createSettingsWindow();
      },
    },
    { type: "separator" },
    {
      label: "Quit",
      click: () => app.quit(),
    },
  ]);

  tray.setContextMenu(contextMenu);
}

// ── State variables ───────────────────────────────────────────────

let isDictating = false;
let currentTranscription = "";
let whisperInitialized = false;
let pendingTranscription = "";
let hasPromptedAccessibilityThisSession = false;
let lastFrontmostApp = null;

function enforceDictationOverlayZOrder() {
  if (!mainWindow) return;

  try {
    if (process.platform === "darwin") {
      mainWindow.setAlwaysOnTop(true, "screen-saver");
    } else {
      mainWindow.setAlwaysOnTop(true);
    }
  } catch {}

  try {
    mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  } catch {}

  try {
    mainWindow.setFocusable(false);
  } catch {}

  try {
    mainWindow.setSkipTaskbar(true);
  } catch {}
}

function getFrontmostAppMac() {
  if (process.platform !== "darwin") return null;
  try {
    const name = execFileSync(
      "osascript",
      [
        "-e",
        'tell application "System Events" to get name of first application process whose frontmost is true',
      ],
      { encoding: "utf8", timeout: 1500 }
    ).trim();

    let bundleId = "";
    try {
      bundleId = execFileSync(
        "osascript",
        [
          "-e",
          'tell application "System Events" to get bundle identifier of first application process whose frontmost is true',
        ],
        { encoding: "utf8", timeout: 1500 }
      ).trim();
    } catch {}

    if (!name) return null;
    return { name, bundleId };
  } catch (error) {
    console.warn("Failed to detect frontmost app:", error.message);
    return null;
  }
}

function activateAppMac(appInfo) {
  if (process.platform !== "darwin") return;
  if (!appInfo) return;

  try {
    if (appInfo.bundleId) {
      execFileSync("open", ["-b", appInfo.bundleId], { timeout: 1500 });
      return;
    }
  } catch {}

  try {
    if (appInfo.name) {
      execFileSync("open", ["-a", appInfo.name], { timeout: 1500 });
    }
  } catch (error) {
    console.warn("Failed to activate target app:", error.message);
  }
}

// ── Helper functions ────────────────────────────────────────────────

function showPasteNotification(text) {
  console.log("Showing paste notification with clipboard content");
  try {
    const notification = new Notification({
      title: "Transcription Ready",
      body: "Text copied to clipboard. Press Cmd+V to paste. Grant Accessibility permission for automatic pasting.",
      silent: false,
      timeoutType: "default",
    });

    notification.on("click", () => {
      if (process.platform === "darwin") {
        shell.openExternal(
          "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility"
        );
      }
    });

    notification.show();
  } catch (error) {
    console.error("Failed to show notification:", error);
  }
}

function ensureMacAccessibilityPermission() {
  if (process.platform !== "darwin") return true;

  const isTrusted = systemPreferences.isTrustedAccessibilityClient(false);
  if (isTrusted) return true;

  if (!hasPromptedAccessibilityThisSession) {
    hasPromptedAccessibilityThisSession = true;
    systemPreferences.isTrustedAccessibilityClient(true);
  }

  shell.openExternal(
    "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility"
  );
  return false;
}

// ── Dictation Functions ─────────────────────────────────────────────

function startDictation() {
  if (isDictating) return;
  isDictating = true;
  currentTranscription = "";
  pendingTranscription = "";
  console.log("Dictation started");

  if (native && native.initWhisper && !whisperInitialized) {
    let modelPath;
    if (isDev) {
      modelPath = path.join(__dirname, "../assets/ggml-small.bin");
    } else {
      modelPath = path.join(
        __dirname,
        "../app.asar.unpacked/assets/ggml-small.bin"
      );
    }

    console.log(`Loading Whisper model from: ${modelPath}`);
    whisperInitialized = native.initWhisper(modelPath);
    if (!whisperInitialized) {
      console.error("Failed to initialize whisper");
    }
  }
}

function stopDictation() {
  if (!isDictating) return;
  isDictating = false;
  console.log("Dictation stopped");
}

function getTranscription() {
  return currentTranscription;
}

function transcribeAudioData(audioBuffer) {
  if (!native || !native.transcribeAudio) {
    console.error("Native whisper transcribe not available");
    return "";
  }

  try {
    const result = native.transcribeAudio(audioBuffer);
    if (result.success) {
      return result.text;
    } else {
      console.error("Transcription failed:", result.errorMessage);
      return "";
    }
  } catch (error) {
    console.error("Error during transcription:", error);
    return "";
  }
}

// ── IPC Handlers (dictation) ────────────────────────────────────────

ipcMain.handle("dictation:start", async () => {
  lastFrontmostApp = getFrontmostAppMac() || lastFrontmostApp;
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
  // Find which window sent this event
  const senderWindow = BrowserWindow.fromWebContents(_event.sender);
  if (senderWindow !== mainWindow) return; // only dictation bar uses click-through
  mainWindow.setIgnoreMouseEvents(ignore, opts || {});
  enforceDictationOverlayZOrder();
});

ipcMain.on("dictation:toggle", () => {
  if (isDictating) {
    stopDictation();
  } else {
    startDictation();
  }
});

ipcMain.handle("dictation:stopAndPaste", async (_event, textOverride) => {
  stopDictation();
  let frontmostAtStop = getFrontmostAppMac() || lastFrontmostApp;
  if (
    process.platform === "darwin" &&
    frontmostAtStop?.name &&
    (frontmostAtStop.name === app.getName() ||
      frontmostAtStop.name === "Electron")
  ) {
    frontmostAtStop = lastFrontmostApp;
  }
  const overrideText = typeof textOverride === "string" ? textOverride : "";
  const text = overrideText.trim()
    ? overrideText
    : pendingTranscription || getTranscription();
  pendingTranscription = "";

  if (text && text.trim()) {
    // Minimize/hide window to ensure focus returns to the background app
    if (mainWindow) {
      mainWindow.hide();
    }

    if (process.platform === "darwin") {
      try {
        app.hide();
      } catch {}
    }

    // Explicitly activate the target app
    if (process.platform === "darwin") {
      activateAppMac(frontmostAtStop);
    }

    await new Promise((resolve) => setTimeout(resolve, 250));

    clipboard.writeText(text);

    await new Promise((resolve) => setTimeout(resolve, 100));

    // Use platform-specific paste commands
    if (process.platform === "darwin") {
      try {
        if (!ensureMacAccessibilityPermission()) {
          showPasteNotification(text);
        } else {
          const appleScript =
            'tell application "System Events" to keystroke "v" using {command down}';
          try {
            execFileSync("osascript", ["-e", appleScript], {
              encoding: "utf8",
              timeout: 5000,
              stdio: ["pipe", "pipe", "pipe"],
            });
          } catch (osError) {
            if (
              osError.message?.includes("osascript is not allowed") ||
              osError.message?.includes("1002") ||
              osError.stderr?.includes("osascript is not allowed") ||
              osError.stderr?.includes("1002")
            ) {
              showPasteNotification(text);
            } else {
              showPasteNotification(text);
            }
          }
        }
      } catch (error) {
        showPasteNotification(text);
      }
    } else if (process.platform === "win32") {
      try {
        execSync(
          'powershell -command "$wshell = New-Object -ComObject wscript.shell; $wshell.SendKeys(\'^v\')"',
          { timeout: 5000 }
        );
      } catch (error) {
        showPasteNotification(text);
      }
    } else if (process.platform === "linux") {
      try {
        execSync("xdotool key ctrl+v", { timeout: 5000 });
      } catch (error) {
        try {
          const safeText = text.replace(/"/g, '\\"').replace(/\$/g, "\\$");
          execSync(`echo "${safeText}" | xclip -selection clipboard`, {
            timeout: 5000,
          });
          showPasteNotification(text);
        } catch (fallbackError) {
          showPasteNotification(text);
        }
      }
    }

    // Restore dictation window
    if (mainWindow) {
      setTimeout(() => {
        if (process.platform === "darwin" && mainWindow?.showInactive) {
          mainWindow.showInactive();
        } else {
          mainWindow?.show?.();
        }
        enforceDictationOverlayZOrder();
        positionWindowBottomCenter();
      }, 100);
    }
  }

  return text;
});

// ── IPC Handlers (native) ────────────────────────────────────────────

ipcMain.handle("native:ping", async () => {
  if (native && native.ping) return native.ping();
  return "pong (JS fallback)";
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

// ── Whisper IPC Handlers ─────────────────────────────────────────────

ipcMain.handle("whisper:init", async (_event, modelPath) => {
  if (native && native.initWhisper) {
    if (!modelPath) {
      if (isDev) {
        modelPath = path.join(__dirname, "../assets/ggml-small.bin");
      } else {
        modelPath = path.join(
          __dirname,
          "../app.asar.unpacked/assets/ggml-small.bin"
        );
      }
    }
    return native.initWhisper(modelPath);
  }
  return false;
});

ipcMain.handle("whisper:transcribe", async (_event, audioData) => {
  if (native && native.transcribeAudio) {
    const settings = loadSettings();
    const language = settings.language || "en";
    return native.transcribeAudio(audioData, language);
  }
  return {
    text: "",
    success: false,
    errorMessage: "Native addon not available",
  };
});

ipcMain.handle("whisper:cleanup", async () => {
  if (native && native.cleanupWhisper) {
    native.cleanupWhisper();
  }
  return true;
});

ipcMain.handle("whisper:setTranscription", async (_event, text) => {
  pendingTranscription = text && text.trim() ? text : "";
  return true;
});

ipcMain.handle("app:getTheme", async () => {
  return nativeTheme.shouldUseDarkColors ? "dark" : "light";
});

ipcMain.handle("app:getPlatform", async () => {
  return process.platform;
});

// ── Permissions & Settings IPC Handlers ──────────────────────────────

ipcMain.handle("permissions:get", async () => {
  const result = { microphone: "not-determined", accessibility: false };

  if (process.platform === "darwin") {
    result.microphone = systemPreferences.getMediaAccessStatus("microphone");
    result.accessibility =
      systemPreferences.isTrustedAccessibilityClient(false);
  } else {
    result.microphone = "granted";
    result.accessibility = true;
  }

  return result;
});

ipcMain.handle("permissions:requestMicrophone", async () => {
  if (process.platform === "darwin") {
    await systemPreferences.askForMediaAccess("microphone");
    return systemPreferences.getMediaAccessStatus("microphone");
  }
  return "granted";
});

ipcMain.handle("permissions:requestAccessibility", async () => {
  if (process.platform === "darwin") {
    systemPreferences.isTrustedAccessibilityClient(true);
    return systemPreferences.isTrustedAccessibilityClient(false);
  }
  return true;
});

ipcMain.handle("settings:get", async () => {
  return loadSettings();
});

ipcMain.handle("settings:set", async (_event, partial) => {
  return saveSettings(partial);
});

ipcMain.handle("settings:openWindow", async () => {
  createSettingsWindow();
  return true;
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

  // Request microphone access at OS level on macOS
  if (process.platform === "darwin") {
    const micStatus = systemPreferences.getMediaAccessStatus("microphone");
    if (micStatus !== "granted") {
      await systemPreferences.askForMediaAccess("microphone");
    }
  }

  // Always create the dictation bar
  createDictationWindow();
  createTray();

  positionWindowBottomCenter();
  mainWindow.showInactive();
  enforceDictationOverlayZOrder();

  // Register global shortcut: Option+Space toggles recording
  const registered = globalShortcut.register("Alt+Space", () => {
    if (mainWindow) {
      mainWindow.webContents.send("dictation:toggle");
    }
  });

  if (!registered) {
    console.warn("Failed to register Alt+Space shortcut");
  }

  // Clicking the dock icon opens the settings window
  app.on("activate", () => {
    createSettingsWindow();
  });
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
