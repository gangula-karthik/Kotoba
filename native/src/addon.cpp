#include <napi.h>
#include "backend.h"

#include <sstream>
#include <iomanip>

// ── ping ─────────────────────────────────────────────────────────────

Napi::Value Ping(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    std::string msg = openwisprflow::ping();
    return Napi::String::New(env, msg);
}

// ── getSystemInfo ────────────────────────────────────────────────────

Napi::Value GetSystemInfo(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    auto si = openwisprflow::get_system_info();

    Napi::Object obj = Napi::Object::New(env);
    obj.Set("platform",     Napi::String::New(env, si.platform));
    obj.Set("arch",         Napi::String::New(env, si.arch));
    obj.Set("cpuCores",     Napi::Number::New(env, si.cpu_cores));

    // Format memory as human-readable string
    double gb = static_cast<double>(si.total_memory_bytes) / (1024.0 * 1024.0 * 1024.0);
    std::ostringstream oss;
    oss << std::fixed << std::setprecision(0) << gb << " GB";
    obj.Set("totalMemory",  Napi::String::New(env, oss.str()));
    obj.Set("nativeAddon",  Napi::Boolean::New(env, si.native_addon));

    return obj;
}

// ── compute ──────────────────────────────────────────────────────────

Napi::Value Compute(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsNumber()) {
        Napi::TypeError::New(env, "Expected a number argument").ThrowAsJavaScriptException();
        return env.Null();
    }

    double input = info[0].As<Napi::Number>().DoubleValue();
    auto cr = openwisprflow::compute(input);

    Napi::Object obj = Napi::Object::New(env);
    obj.Set("result", Napi::Number::New(env, cr.result));
    obj.Set("engine", Napi::String::New(env, cr.engine));
    return obj;
}

// ── Module init ──────────────────────────────────────────────────────

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set("ping",          Napi::Function::New(env, Ping));
    exports.Set("getSystemInfo", Napi::Function::New(env, GetSystemInfo));
    exports.Set("compute",       Napi::Function::New(env, Compute));
    return exports;
}

NODE_API_MODULE(openwisprflow_native, Init)
