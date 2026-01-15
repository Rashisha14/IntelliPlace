# Interview Feature Setup Guide

This guide explains how to set up the AI-powered interview feature using Gemini AI.

## Overview

The interview feature allows companies to conduct AI-powered interviews with shortlisted candidates. It supports two modes:
- **TECH**: Technical interviews focusing on programming and technical skills
- **HR**: Behavioral interviews focusing on soft skills and cultural fit

## Architecture

1. **Flask Service** (`intelliplace-interview-service/`): Generates interview questions using Gemini AI
2. **Backend API** (`intelliplace-backend/routes/interviews.js`): Manages interview sessions and questions
3. **Frontend Component** (`intelliplace-frontend/src/components/CompanyStartInterview.jsx`): UI for conducting interviews

## Setup Steps

### 1. Install Interview Service Dependencies

```bash
cd intelliplace-interview-service
pip install -r requirements.txt
```

### 2. Get Gemini API Key

1. Go to [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Sign in with your Google account
3. Click "Create API Key"
4. Copy the API key

### 3. Configure Interview Service

Create a `.env` file in `intelliplace-interview-service/`:

```env
GEMINI_API_KEY=your_gemini_api_key_here
PORT=8001
```

### 4. Start Interview Service

```bash
cd intelliplace-interview-service
python app.py
```

The service will run on `http://localhost:8001`

### 5. Configure Backend

Add to `intelliplace-backend/.env`:

```env
# Interview Service URL
INTERVIEW_SERVICE_URL=http://localhost:8001
```

### 6. Run Database Migration

The schema has been updated to include `InterviewSession` model. Run:

```bash
cd intelliplace-backend
npm run prisma:migrate
```

When prompted, name the migration: `add_interview_sessions`

### 7. Start Backend

```bash
cd intelliplace-backend
npm run dev
```

## Usage

### For Companies

1. Navigate to **Recruitment Process** page for a job
2. Click on the **Interview** tab
3. You'll see all shortlisted candidates
4. Click **Start Interview** for a candidate
5. Select **TECH** or **HR** mode
6. The system will generate the first question automatically
7. Review the candidate's answer and add your notes
8. Click **Generate Next Question** to continue
9. Click **Complete Interview** when done

### API Endpoints

#### Start Interview Session
```
POST /api/jobs/:jobId/interviews/:applicationId/start
Body: { "mode": "TECH" | "HR" }
```

#### Generate Question
```
POST /api/jobs/:jobId/interviews/:applicationId/generate-question
```

#### Submit Answer
```
POST /api/jobs/:jobId/interviews/:applicationId/submit-answer
Body: { "answer": "Your notes", "questionIndex": 0 }
```

#### Get Session Details
```
GET /api/jobs/:jobId/interviews/:applicationId/session
```

#### Complete Interview
```
POST /api/jobs/:jobId/interviews/:applicationId/complete
```

## Features

- **AI-Powered Questions**: Context-aware questions generated based on job requirements and candidate profile
- **Tech Mode**: Technical questions focusing on programming skills and problem-solving
- **HR Mode**: Behavioral questions using STAR method format
- **Question History**: Track all questions asked and answers provided
- **Session Management**: Multiple interview sessions per candidate
- **Real-time Updates**: Questions and answers are saved in real-time

## Troubleshooting

### Interview Service Not Responding

1. Check if the service is running: `curl http://localhost:8001/health`
2. Verify GEMINI_API_KEY is set correctly
3. Check service logs for errors

### Questions Not Generating

1. Verify INTERVIEW_SERVICE_URL is set in backend `.env`
2. Check backend logs for connection errors
3. Ensure Gemini API key is valid and has quota remaining

### Database Errors

1. Run Prisma migration: `npm run prisma:migrate`
2. Regenerate Prisma client: `npm run prisma:generate`
3. Check database connection

## Notes

- Questions are generated dynamically using Gemini AI
- Previous questions are tracked to avoid repetition
- Interview sessions can be resumed if interrupted
- All interview data is stored in the database
