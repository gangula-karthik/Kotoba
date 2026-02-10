#pragma once

#include <string>
#include <unordered_map>
#include <vector>
#include <cstdint>

namespace openwisprflow {

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

} // namespace openwisprflow
