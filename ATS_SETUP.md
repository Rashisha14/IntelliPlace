# ATS (Applicant Tracking System) Setup Guide

This guide explains how to set up and use the AI-powered resume evaluation system.

## Overview

The ATS system uses a Python microservice to evaluate resumes based on:
- Semantic similarity between resume and job description
- Skill matching
- Experience, projects, and education alignment

## Prerequisites

1. **Python 3.8+** installed
2. **Node.js backend** running
3. **Supabase** configured for CV storage

## Setup Steps

### 1. Install Python Dependencies

```bash
cd intelliplace-ats-service
pip install -r requirements.txt
```

### 2. Download spaCy Model

```bash
python -m spacy download en_core_web_sm
```

**Note:** The Sentence-BERT model (`all-mpnet-base-v2`) will download automatically on first use (requires internet connection).

### 3. Start the ATS Service

```bash
cd intelliplace-ats-service
python main.py
```

Or with uvicorn:

```bash
uvicorn main:app --host 0.0.0.0 --port 8000
```

The service will be available at `http://localhost:8000`

### 4. Configure Backend

Add the ATS service URL to your backend `.env` file:

```env
ATS_SERVICE_URL=http://localhost:8000
```

If not set, it defaults to `http://localhost:8000`.

### 5. Verify Installation

Visit the ATS service documentation:
- Swagger UI: http://localhost:8000/docs
- Health check: http://localhost:8000/health

## Usage

### From Company Dashboard

1. Navigate to a job posting
2. Click "View Applications"
3. Click the **"Shortlist using Resume"** button (purple button with sparkles icon)
4. The system will:
   - Check eligibility (CGPA, backlog) first
   - Extract text from CVs
   - Evaluate each eligible candidate using AI
   - Update application statuses automatically
   - Send notifications to students

### Decision Logic

- **SHORTLISTED**: Final score >= 80%
- **REVIEW**: Final score >= 60% but < 80%
- **REJECTED**: Final score < 60%

## Scoring Model

The ATS uses a weighted scoring system:

- **Semantic Similarity** (40%): Overall fit between resume and job description
- **Skill Match** (25%): Percentage of required skills found
- **Experience** (15%): How well experience meets requirements
- **Projects/Internships** (10%): Number of projects and internships
- **Education Match** (10%): Education level alignment

## Troubleshooting

### ATS Service Not Starting

1. Check Python version: `python --version` (should be 3.8+)
2. Verify dependencies: `pip list | grep -E "fastapi|spacy|sentence-transformers"`
3. Check if port 8000 is available: `netstat -an | grep 8000`

### spaCy Model Error

```bash
python -m spacy download en_core_web_sm
```

### Sentence-BERT Download Issues

- Ensure internet connectivity on first run
- The model (~420MB) downloads automatically
- Check disk space availability

### CV Text Extraction Fails

- Only PDF files are currently supported for text extraction
- DOC/DOCX files will be marked for manual review
- Ensure CVs are not password-protected or corrupted

### Backend Cannot Connect to ATS Service

1. Verify ATS service is running: `curl http://localhost:8000/health`
2. Check `ATS_SERVICE_URL` in backend `.env`
3. Check firewall settings
4. Verify both services are on the same network

## API Endpoint

### POST /api/jobs/:jobId/shortlist-ats

**Authentication:** Required (Company token)

**Response:**
```json
{
  "success": true,
  "message": "ATS shortlisting complete. Processed: 10, Shortlisted: 5, Review: 3, Rejected: 2",
  "data": {
    "processed": 10,
    "shortlisted": 5,
    "review": 3,
    "rejected": 2
  }
}
```

## Important Notes

1. **Eligibility First**: The ATS only evaluates candidates who pass eligibility checks (CGPA, backlog). Ineligible candidates are automatically rejected.

2. **No Black-Box Decisions**: All scoring is deterministic and explainable. Scores are based on explicit weights and rules.

3. **Campus Recruitment Focus**: The system is optimized for campus recruitment where candidates may have limited work experience.

4. **CV Format**: Currently supports PDF text extraction. DOC/DOCX files require manual review.

## Production Deployment

For production:

1. Use a process manager (PM2, systemd) for the Python service
2. Set up reverse proxy (nginx) for the ATS service
3. Use environment variables for configuration
4. Monitor service health and logs
5. Consider GPU acceleration for faster inference
6. Implement rate limiting for API calls

## Support

For issues or questions, check:
- ATS Service logs: Console output from `python main.py`
- Backend logs: Check Node.js server console
- API Documentation: http://localhost:8000/docs


