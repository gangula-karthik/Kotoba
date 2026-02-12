#include "backend.h"

#include <chrono>
#include <cmath>
#include <thread>
#include <memory>

#ifdef _WIN32
// Prevent windows.h from defining macros for `min`/`max` which break std::min/std::max
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>
#include <algorithm>
#elif __APPLE__
#include <sys/sysctl.h>
#include <sys/types.h>
#include <mach/mach.h>
#include <CoreGraphics/CoreGraphics.h>
#else
#include <unistd.h>
#endif

// Whisper includes
#include "whisper.cpp/include/whisper.h"

namespace koto {

// ── Whisper state ───────────────────────────────────────────────────

static struct whisper_context* g_whisper_ctx = nullptr;
static bool g_whisper_initialized = false;

// ── Helpers ──────────────────────────────────────────────────────────

static int get_cpu_cores() {
#ifdef _WIN32
    SYSTEM_INFO si;
    GetSystemInfo(&si);
    return static_cast<int>(si.dwNumberOfProcessors);
#elif __APPLE__
    int cores = 1;
    size_t len = sizeof(cores);
    sysctlbyname("hw.logicalcpu", &cores, &len, nullptr, 0);
    return cores;
#else
    return static_cast<int>(sysconf(_SC_NPROCESSORS_ONLN));
#endif
}

static uint64_t get_total_memory() {
#ifdef _WIN32
    MEMORYSTATUSEX mem;
    mem.dwLength = sizeof(mem);
    GlobalMemoryStatusEx(&mem);
    return mem.ullTotalPhys;
#elif __APPLE__
    uint64_t mem = 0;
    size_t len = sizeof(mem);
    sysctlbyname("hw.memsize", &mem, &len, nullptr, 0);
    return mem;
#else
    long pages = sysconf(_SC_PHYS_PAGES);
    long page_size = sysconf(_SC_PAGE_SIZE);
    return static_cast<uint64_t>(pages) * static_cast<uint64_t>(page_size);
#endif
}

static std::string get_platform_name() {
#ifdef _WIN32
    return "win32";
#elif __APPLE__
    return "darwin";
#else
    return "linux";
#endif
}

static std::string get_arch_name() {
#if defined(__x86_64__) || defined(_M_X64)
    return "x64";
#elif defined(__aarch64__) || defined(_M_ARM64)
    return "arm64";
#else
    return "unknown";
#endif
}

// ── Public API ──────────────────────────────────────────────────────

std::string ping() {
    return "pong (native C++ addon)";
}

SystemInfo get_system_info() {
    SystemInfo info;
    info.platform          = get_platform_name();
    info.arch              = get_arch_name();
    info.cpu_cores         = get_cpu_cores();
    info.total_memory_bytes = get_total_memory();
    info.native_addon      = true;
    return info;
}

ComputeResult compute(double input) {
    // Example: a non-trivial computation to demonstrate native performance.
    // Replace this with your actual backend logic.
    double result = 0.0;
    for (int i = 0; i < 1000000; ++i) {
        result += std::sin(input + static_cast<double>(i) * 0.000001);
    }
    return { result, "native-cpp" };
}

// ── Whisper implementation ──────────────────────────────────────────

bool init_whisper(const std::string& model_path) {
    if (g_whisper_initialized) {
        return true; // Already initialized
    }

    // Initialize whisper context
    whisper_context_params cparams = whisper_context_default_params();
    g_whisper_ctx = whisper_init_from_file_with_params(model_path.c_str(), cparams);

    if (g_whisper_ctx == nullptr) {
        return false;
    }

    g_whisper_initialized = true;
    return true;
}

WhisperResult transcribe_audio(const std::vector<float>& audio_samples, const std::string& language) {
    if (!g_whisper_initialized || g_whisper_ctx == nullptr) {
        return {"", false, "Whisper not initialized"};
    }

    if (audio_samples.empty()) {
        return {"", false, "No audio samples provided"};
    }

    // Set up parameters for transcription
    whisper_full_params wparams = whisper_full_default_params(WHISPER_SAMPLING_GREEDY);
    wparams.print_realtime   = false;
    wparams.print_progress   = false;
    wparams.print_timestamps = false;
    wparams.print_special    = false;
    wparams.translate        = false;
    wparams.language         = language.c_str();
    wparams.n_threads        = std::min(4, get_cpu_cores());  // Use up to 4 threads
    wparams.offset_ms        = 0;
    wparams.duration_ms      = 0;    // Process entire audio
    wparams.n_max_text_ctx   = -1;
    wparams.max_len          = 0;
    wparams.split_on_word    = false;
    wparams.no_context       = true; // Faster for real-time
    wparams.single_segment   = true; // Single segment for simplicity

    // Run transcription
    int result = whisper_full(g_whisper_ctx, wparams, audio_samples.data(), static_cast<int>(audio_samples.size()));

    if (result != 0) {
        return {"", false, "Transcription failed"};
    }

    // Get the transcribed text
    int n_segments = whisper_full_n_segments(g_whisper_ctx);
    std::string full_text;

    for (int i = 0; i < n_segments; ++i) {
        const char* segment_text = whisper_full_get_segment_text(g_whisper_ctx, i);
        if (segment_text) {
            if (!full_text.empty()) {
                full_text += " ";
            }
            full_text += segment_text;
        }
    }

    return {full_text, true, ""};
}

void cleanup_whisper() {
    if (g_whisper_ctx != nullptr) {
        whisper_free(g_whisper_ctx);
        g_whisper_ctx = nullptr;
    }
    g_whisper_initialized = false;
}

// ── Modifier Key Detection ──────────────────────────────────────────

bool is_option_key_pressed() {
#ifdef __APPLE__
    CGEventFlags flags = CGEventSourceFlagsState(kCGEventSourceStateCombinedSessionState);
    return (flags & kCGEventFlagMaskAlternate) != 0;
#else
    return false;
#endif
}

} // namespace koto
