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
const { exec, execSync, execFileSync } = require("child_process");

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
    show: false, // Don't show immediately
    focusable: false, // Don't allow focus
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

  // Ensure window doesn't accept keyboard focus
  mainWindow.setFocusable(false);
  mainWindow.setSkipTaskbar(true);

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

// ── State variables ───────────────────────────────────────────────

let isDictating = false;
let currentTranscription = "";
let whisperInitialized = false;
let pendingTranscription = ""; // Store transcription result
let hasPromptedAccessibilityThisSession = false;
let lastFrontmostApp = null; // Best-effort target app for pasting (macOS)

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
    } catch {
      // Some macOS versions reject reading bundle identifier; name-only is still useful.
    }

    if (!name) return null;
    return { name, bundleId };
  } catch (error) {
    console.warn("⚠️ Failed to detect frontmost app:", error.message);
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
  } catch {
    // Fall through to name-based activation.
  }

  try {
    if (appInfo.name) {
      execFileSync("open", ["-a", appInfo.name], { timeout: 1500 });
    }
  } catch (error) {
    console.warn("⚠️ Failed to activate target app:", error.message);
  }
}

// ── Helper functions ────────────────────────────────────────────────

function showPasteNotification(text) {
  console.log("🔔 Showing paste notification with clipboard content");
  try {
    const notification = new Notification({
      title: '✅ Transcription Ready',
      body: 'Text copied to clipboard. Press Cmd+V to paste. Grant Accessibility permission for automatic pasting.',
      silent: false,
      timeoutType: 'default'
    });

    notification.on('click', () => {
      console.log("User clicked notification");
      // Open accessibility settings
      if (process.platform === "darwin") {
        shell.openExternal("x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility");
      }
    });

    notification.show();
    console.log("✅ Notification shown successfully");
    console.log(`📋 Transcription copied to clipboard (${text.length} chars): "${text}"`);
  } catch (error) {
    console.error("❌ Failed to show notification:", error);
    // Fallback: log to stderr
    console.error(`Transcription text: "${text}"`);
  }
}

function ensureMacAccessibilityPermission() {
  if (process.platform !== "darwin") return true;

  const isTrusted = systemPreferences.isTrustedAccessibilityClient(false);
  if (isTrusted) {
    console.log("✅ Accessibility permission already granted");
    return true;
  }

  if (!hasPromptedAccessibilityThisSession) {
    hasPromptedAccessibilityThisSession = true;
    console.log("🔐 Requesting accessibility permission...");
    systemPreferences.isTrustedAccessibilityClient(true);
  }

  console.log("⚠️ Accessibility permission required, opening system preferences");
  shell.openExternal("x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility");
  return false;
}

// ── Dictation Functions ─────────────────────────────────────────────

function startDictation() {
  if (isDictating) return;
  isDictating = true;
  currentTranscription = "";
  pendingTranscription = ""; // Clear any previous transcription
  console.log("Dictation started");

  if (native && native.initWhisper && !whisperInitialized) {
    let modelPath;
    if (isDev) {
      modelPath = path.join(__dirname, "../assets/ggml-small.bin");
    } else {
      modelPath = path.join(__dirname, "../app.asar.unpacked/assets/ggml-small.bin");
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

  // TODO: Stop audio recording and process the recorded audio with whisper
  // For now, we'll keep the mock transcription for testing
}

function getTranscription() {
  return currentTranscription;
}

// Transcribe audio data using whisper
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
  // Capture the current frontmost app as a fallback target for pasting.
  // Note: paste uses the frontmost app at stop time first; this is a backup.
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

ipcMain.handle("dictation:stopAndPaste", async (_event, textOverride) => {
  stopDictation();
  let frontmostAtStop = getFrontmostAppMac() || lastFrontmostApp;
  // If our own process is reported as frontmost, fall back to the last captured external app.
  if (
    process.platform === "darwin" &&
    frontmostAtStop?.name &&
    (frontmostAtStop.name === app.getName() || frontmostAtStop.name === "Electron")
  ) {
    frontmostAtStop = lastFrontmostApp;
  }
  const overrideText = typeof textOverride === "string" ? textOverride : "";
  const text = overrideText.trim() ? overrideText : pendingTranscription || getTranscription();
  console.log("stopAndPaste - pendingTranscription:", pendingTranscription);
  console.log("stopAndPaste - currentTranscription:", currentTranscription);
  console.log("stopAndPaste - final text to paste:", text);
  pendingTranscription = ""; // Clear it

  if (text && text.trim()) {
    console.log("✅ Text is valid, proceeding with paste");

    // Keep track of original window state
    const wasAlwaysOnTop = mainWindow?.isAlwaysOnTop?.();

    // Minimize/hide window to ensure focus returns to the background app
    if (mainWindow) {
      console.log("🔄 Hiding window to return focus to background app");
      mainWindow.hide();
    }

    // Hide the app itself (macOS) so it doesn't accidentally become active
    if (process.platform === "darwin") {
      try {
        app.hide();
      } catch {}
    }

    // Explicitly activate the target app so paste goes to the active cursor
    if (process.platform === "darwin") {
      activateAppMac(frontmostAtStop);
    }

    // Longer delay to ensure focus fully transfers
    console.log("⏳ Waiting 250ms for focus to return to target app...");
    await new Promise((resolve) => setTimeout(resolve, 250));
    console.log("✅ Focus delay completed");

    // Write to clipboard
    console.log("📋 Writing to clipboard:", text);
    clipboard.writeText(text);
    console.log("✅ Clipboard write completed");

    // Small additional delay to ensure clipboard is set
    console.log("⏳ Waiting 100ms for clipboard...");
    await new Promise((resolve) => setTimeout(resolve, 100));
    console.log("✅ Clipboard delay completed");

    // Use platform-specific paste commands
    if (process.platform === "darwin") {
      console.log("🍎 Attempting macOS paste via AppleScript");
      try {
        if (!ensureMacAccessibilityPermission()) {
          showPasteNotification(text);
        } else {
          const appleScript = 'tell application "System Events" to keystroke "v" using {command down}';

          try {
            const result = execFileSync("osascript", ["-e", appleScript], {
              encoding: "utf8",
              timeout: 5000,
              stdio: ["pipe", "pipe", "pipe"],
            }).trim();
            console.log("✅ AppleScript executed successfully");
            console.log("📄 AppleScript result:", result);
          } catch (osError) {
            console.error("❌ AppleScript execution failed:", osError.message);

            // Check for accessibility permission error
            if (
              osError.message?.includes("osascript is not allowed") ||
              osError.message?.includes("1002") ||
              osError.stderr?.includes("osascript is not allowed") ||
              osError.stderr?.includes("1002")
            ) {
              console.warn("⚠️ Accessibility permissions required for automatic paste");
              showPasteNotification(text);
            } else {
              // Unknown error, show notification as fallback
              console.warn("⚠️ AppleScript error, falling back to notification");
              showPasteNotification(text);
            }
          }
        }
      } catch (error) {
        console.error("❌ Failed to setup AppleScript:", error);
        showPasteNotification(text);
      }
    } else if (process.platform === "win32") {
      // On Windows, use PowerShell to simulate Ctrl+V
      try {
        execSync(
          'powershell -command "$wshell = New-Object -ComObject wscript.shell; $wshell.SendKeys(\'^v\')"',
          { timeout: 5000 }
        );
        console.log("✅ Windows paste executed successfully");
      } catch (error) {
        console.error("❌ Windows paste failed:", error.message);
        showPasteNotification(text);
      }
    } else if (process.platform === "linux") {
      // On Linux, use xdotool to simulate Ctrl+V
      try {
        execSync("xdotool key ctrl+v", { timeout: 5000 });
        console.log("✅ Linux paste executed successfully");
      } catch (error) {
        console.error("❌ Linux paste failed:", error.message);
        // Fallback: try xclip if xdotool fails
        try {
          const safeText = text.replace(/"/g, '\\"').replace(/\$/g, '\\$');
          execSync(`echo "${safeText}" | xclip -selection clipboard`, { timeout: 5000 });
          showPasteNotification(text);
        } catch (fallbackError) {
          console.error("❌ Fallback paste also failed:", fallbackError.message);
          showPasteNotification(text);
        }
      }
    }

    // Restore window state
    console.log("🔄 Restoring window state");
    if (mainWindow) {
      setTimeout(() => {
        if (process.platform === "darwin" && mainWindow?.showInactive) {
          mainWindow.showInactive();
        } else {
          mainWindow?.show?.();
        }
        mainWindow?.setAlwaysOnTop?.(wasAlwaysOnTop !== false);
        mainWindow?.setFocusable?.(false);
        mainWindow?.setSkipTaskbar?.(true);
        positionWindowBottomCenter();
        console.log("✅ Window state restored");
      }, 100);
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

// ── Whisper IPC Handlers ─────────────────────────────────────────────

ipcMain.handle("whisper:init", async (_event, modelPath) => {
  if (native && native.initWhisper) {
    // If no path provided, use dynamic resolution
    if (!modelPath) {
      if (isDev) {
        modelPath = path.join(__dirname, "../assets/ggml-small.bin");
      } else {
        modelPath = path.join(__dirname, "../app.asar.unpacked/assets/ggml-small.bin");
      }
    }
    return native.initWhisper(modelPath);
  }
  return false;
});

ipcMain.handle("whisper:transcribe", async (_event, audioData) => {
  if (native && native.transcribeAudio) {
    return native.transcribeAudio(audioData);
  }
  return { text: "", success: false, errorMessage: "Native addon not available" };
});

ipcMain.handle("whisper:cleanup", async () => {
  if (native && native.cleanupWhisper) {
    native.cleanupWhisper();
  }
  return true;
});

ipcMain.handle("whisper:setTranscription", async (_event, text) => {
  console.log("Setting transcription:", text ? `"${text}"` : "(empty)");
  // Only set if we have actual text, otherwise clear it
  pendingTranscription = text && text.trim() ? text : "";
  return true;
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
