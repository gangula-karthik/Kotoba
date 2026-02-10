#include "backend.h"

#include <chrono>
#include <cmath>
#include <thread>

#ifdef _WIN32
#include <windows.h>
#elif __APPLE__
#include <sys/sysctl.h>
#include <sys/types.h>
#include <mach/mach.h>
#else
#include <unistd.h>
#endif

namespace openwisprflow {

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

} // namespace openwisprflow
