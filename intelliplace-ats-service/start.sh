#!/bin/bash
# Quick start script for ATS Service

echo "Starting IntelliPlace ATS Service..."
echo ""

# Check Python version
python_version=$(python3 --version 2>&1)
echo "Python version: $python_version"

# Check if spaCy model is installed
if ! python3 -c "import spacy; spacy.load('en_core_web_sm')" 2>/dev/null; then
    echo "Installing spaCy model..."
    python3 -m spacy download en_core_web_sm
fi

# Start the service
echo "Starting ATS service on http://localhost:8000"
echo "API docs available at http://localhost:8000/docs"
echo ""
python3 main.py


