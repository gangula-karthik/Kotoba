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

// ── initWhisper ──────────────────────────────────────────────────────

Napi::Value InitWhisper(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsString()) {
        Napi::TypeError::New(env, "Model path string is required").ThrowAsJavaScriptException();
        return env.Null();
    }

    std::string model_path = info[0].As<Napi::String>().Utf8Value();

    if (model_path.empty()) {
        Napi::TypeError::New(env, "Model path cannot be empty").ThrowAsJavaScriptException();
        return env.Null();
    }

    bool success = openwisprflow::init_whisper(model_path);
    return Napi::Boolean::New(env, success);
}

// ── transcribeAudio ──────────────────────────────────────────────────

Napi::Value TranscribeAudio(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsTypedArray()) {
        Napi::TypeError::New(env, "Expected a Float32Array of audio samples").ThrowAsJavaScriptException();
        return env.Null();
    }

    Napi::TypedArray audio_array = info[0].As<Napi::TypedArray>();
    if (audio_array.TypedArrayType() != napi_float32_array) {
        Napi::TypeError::New(env, "Expected a Float32Array").ThrowAsJavaScriptException();
        return env.Null();
    }

    // Convert TypedArray to std::vector<float>
    size_t length = audio_array.ElementLength();
    float* data = reinterpret_cast<float*>(audio_array.ArrayBuffer().Data()) + audio_array.ByteOffset() / sizeof(float);
    std::vector<float> audio_samples(data, data + length);

    auto result = openwisprflow::transcribe_audio(audio_samples);

    Napi::Object obj = Napi::Object::New(env);
    obj.Set("text", Napi::String::New(env, result.text));
    obj.Set("success", Napi::Boolean::New(env, result.success));
    obj.Set("errorMessage", Napi::String::New(env, result.error_message));

    return obj;
}

// ── cleanupWhisper ───────────────────────────────────────────────────

Napi::Value CleanupWhisper(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    openwisprflow::cleanup_whisper();
    return env.Undefined();
}

// ── Module init ──────────────────────────────────────────────────────

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set("ping",          Napi::Function::New(env, Ping));
    exports.Set("getSystemInfo", Napi::Function::New(env, GetSystemInfo));
    exports.Set("compute",       Napi::Function::New(env, Compute));
    exports.Set("initWhisper",   Napi::Function::New(env, InitWhisper));
    exports.Set("transcribeAudio", Napi::Function::New(env, TranscribeAudio));
    exports.Set("cleanupWhisper", Napi::Function::New(env, CleanupWhisper));
    return exports;
}

NODE_API_MODULE(openwisprflow_native, Init)
