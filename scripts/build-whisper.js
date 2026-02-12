const { execSync } = require('child_process');
const path = require('path');

const whisperDir = path.join(__dirname, '..', 'native', 'src', 'whisper.cpp');

if (process.platform === 'win32') {
  // Run the Windows batch script
  execSync(`"${path.join(__dirname, 'build-whisper-windows.bat')}"`, { stdio: 'inherit', cwd: whisperDir });
} else {
  // For macOS/Linux, use make
  execSync('make', { stdio: 'inherit', cwd: whisperDir });
}