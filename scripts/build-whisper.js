const { execSync } = require('child_process');
const path = require('path');

const whisperDir = path.join(__dirname, '..', 'native', 'src', 'whisper.cpp');

if (process.platform === 'win32') {
  // Run the Windows batch script
  execSync(`"${path.join(__dirname, 'build-whisper-windows.bat')}"`, { stdio: 'inherit', cwd: whisperDir });
} else {
  // For macOS/Linux, use CMake to configure and build to ensure the library is created
  try {
    execSync('mkdir -p build', { stdio: 'inherit', cwd: whisperDir });
    execSync('cmake .. -DCMAKE_BUILD_TYPE=Release', { stdio: 'inherit', cwd: path.join(whisperDir, 'build') });
    execSync('cmake --build . --config Release', { stdio: 'inherit', cwd: path.join(whisperDir, 'build') });
  } catch (err) {
    // Fallback to make if CMake is not available
    console.warn('CMake build failed, falling back to make:', err.message);
    execSync('make', { stdio: 'inherit', cwd: whisperDir });
  }
}