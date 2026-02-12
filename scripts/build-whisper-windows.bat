@echo off
cd native\src\whisper.cpp
if not exist build mkdir build
cd build
cmake .. -DCMAKE_BUILD_TYPE=Release
cmake --build . --config Release
REM After build, try to locate whisper.dll / whisper.lib and copy to the expected locations
cd ..\..
echo Locating built whisper artifacts...
setlocal enabledelayedexpansion
set FOUND_DLL=
for /r build %%f in (whisper.dll) do (
	set FOUND_DLL=%%f
	goto :found
)
:found
if defined FOUND_DLL (
	echo Found whisper.dll at %FOUND_DLL%
	REM Ensure destination directory exists
	if not exist build\src\Release mkdir build\src\Release
	copy "%FOUND_DLL%" build\src\Release\whisper.dll
) else (
	echo whisper.dll not found in build tree
)

set FOUND_LIB=
for /r build %%f in (whisper.lib) do (
	set FOUND_LIB=%%f
	goto :foundlib
)
:foundlib
if defined FOUND_LIB (
	echo Found whisper.lib at %FOUND_LIB%
	copy "%FOUND_LIB%" build\src\Release\whisper.lib
) else (
	echo whisper.lib not found in build tree
)

echo Whisper build completed.