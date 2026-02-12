#pragma once

#include <string>
#include <unordered_map>
#include <vector>
#include <cstdint>

namespace koto {

// ── System Information ──────────────────────────────────────────────

struct SystemInfo {
    std::string platform;
    std::string arch;
    int         cpu_cores;
    uint64_t    total_memory_bytes;
    bool        native_addon;
};

SystemInfo get_system_info();

// ── Example compute function (replace with your own logic) ──────────

struct ComputeResult {
    double      result;
    std::string engine;
};

ComputeResult compute(double input);

// ── Ping / health check ─────────────────────────────────────────────

std::string ping();

// ── Whisper Speech-to-Text ──────────────────────────────────────────

struct WhisperResult {
    std::string text;
    bool        success;
    std::string error_message;
};

// Initialize whisper with the small model
bool init_whisper(const std::string& model_path = "models/ggml-small.bin");

// Process audio data (expects 16kHz float samples)
WhisperResult transcribe_audio(const std::vector<float>& audio_samples, const std::string& language = "en");

// Cleanup whisper resources
void cleanup_whisper();

} // namespace koto
