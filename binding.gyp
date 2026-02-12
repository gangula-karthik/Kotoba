{
  "targets": [
    {
      "target_name": "koto_native",
      "sources": [
        "native/src/addon.cpp",
        "native/src/backend.cpp"
      ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")",
        "native/src/whisper.cpp/include",
        "native/src/whisper.cpp/ggml/include"
      ],
      "defines": ["NAPI_DISABLE_CPP_EXCEPTIONS"],
      "cflags!": ["-fno-exceptions"],
      "cflags_cc!": ["-fno-exceptions"],
      "conditions": [
        [
          "OS=='mac'",
          {
            "libraries": [
              "<(module_root_dir)/native/src/whisper.cpp/build/src/libwhisper.dylib"
            ],
            "xcode_settings": {
              "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
              "CLANG_CXX_LIBRARY": "libc++",
              "MACOSX_DEPLOYMENT_TARGET": "12.0",
              "OTHER_CPLUSPLUSFLAGS": ["-std=c++17"],
              "OTHER_LDFLAGS": [
                "-L<(module_root_dir)/native/src/whisper.cpp/build/src",
                "-lwhisper",
                "-Wl,-rpath,<(module_root_dir)/native/src/whisper.cpp/build/src"
              ]
            }
          }
        ],
        [
          "OS=='win'",
          {
            "libraries": [
              "<(module_root_dir)/native/src/whisper.cpp/build/src/Release/whisper.lib"
            ],
            "msvs_settings": {
              "VCCLCompilerTool": {
                "ExceptionHandling": 1,
                "AdditionalOptions": ["/std:c++17"]
              },
              "VCLinkerTool": {
                "AdditionalLibraryDirectories": [
                  "<(module_root_dir)/native/src/whisper.cpp/build/src/Release"
                ]
              }
            },
            "copies": [
              {
                "destination": "<(module_root_dir)/build/Release",
                "files": [
                  "<(module_root_dir)/native/src/whisper.cpp/build/src/Release/whisper.dll"
                ]
              }
            ]
          }
        ],
        [
          "OS=='linux'",
          {
            "libraries": [
              "<(module_root_dir)/native/src/whisper.cpp/build/src/libwhisper.so"
            ],
            "cflags_cc": ["-std=c++17", "-fexceptions"],
            "ldflags": [
              "-L<(module_root_dir)/native/src/whisper.cpp/build/src",
              "-Wl,-rpath,<(module_root_dir)/native/src/whisper.cpp/build/src"
            ]
          }
        ]
      ]
    }
  ]
}
