@echo off
echo Building Viali Card Reader Bridge...
echo.

REM Activate venv if it exists
if exist venv\Scripts\activate.bat (
    call venv\Scripts\activate.bat
)

REM Build single .exe
pyinstaller --onefile --windowed --name "VialiCardReader" --icon=NONE bridge.py

echo.
echo Build complete! .exe is in dist\VialiCardReader.exe
echo Copy dist\VialiCardReader.exe and config.env to the target PC.
pause
