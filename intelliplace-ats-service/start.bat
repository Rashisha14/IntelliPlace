@echo off
REM Quick start script for ATS Service (Windows)

echo Starting IntelliPlace ATS Service...
echo.

REM Check Python version
python --version

REM Check if spaCy model is installed
python -c "import spacy; spacy.load('en_core_web_sm')" 2>nul
if errorlevel 1 (
    echo Installing spaCy model...
    python -m spacy download en_core_web_sm
)

REM Start the service
echo.
echo Starting ATS service on http://localhost:8000
echo API docs available at http://localhost:8000/docs
echo.
python main.py


