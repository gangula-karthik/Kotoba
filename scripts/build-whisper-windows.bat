@echo off
cd native\src\whisper.cpp
if not exist build mkdir build
cd build
cmake .. -DCMAKE_BUILD_TYPE=Release
cmake --build . --config Release
cd ..\..
echo Whisper build completed.