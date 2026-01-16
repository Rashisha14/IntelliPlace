# Interview Analysis System Setup

## Overview
This system implements comprehensive audio/video analysis for interview answers, including:
- **Speech-to-Text**: Google Speech Recognition
- **Audio Analysis**: Librosa for pitch/energy/confidence scoring
- **Visual Analysis**: DeepFace for facial emotion detection
- **Content Grading**: Gemini AI for answer quality (0-10 scale)

## Components Added

### 1. Database Schema Updates
- **InterviewQuestionAnswer** model added to store:
  - Transcribed text
  - Audio/video URLs
  - Content score (Gemini AI)
  - Confidence score (Librosa)
  - Emotion scores (DeepFace)
  - Overall score
  - Feedback

### 2. Interview Service Enhancements (`intelliplace-interview-service/app.py`)
- **New Endpoint**: `/analyze-answer` (POST)
  - Accepts: `question`, `audio_data` (base64), `video_frames` (base64 array)
  - Returns: Complete analysis with scores and feedback

### 3. Backend Routes (`intelliplace-backend/routes/interviews.js`)
- **Updated**: `POST /:jobId/interviews/:applicationId/submit-answer`
  - Now supports both student (audio/video) and company (text notes) submissions
  - Automatically calls interview service for analysis when audio/video is provided
  - Stores analysis results in database

- **New**: `GET /:jobId/interviews/:applicationId/student-session`
  - Allows students to fetch their interview session and questions

### 4. Frontend Components

#### StudentInterview Component (`intelliplace-frontend/src/components/StudentInterview.jsx`)
- Audio/video recording interface
- Real-time video preview
- Frame capture for emotion analysis
- Displays analysis results:
  - Content Score (0-10)
  - Confidence Score (0-10)
  - Overall Score (0-10)
  - Dominant Emotion
  - Transcribed Text
  - AI Feedback
  - Emotion Breakdown

## Installation

### 1. Install Python Dependencies
```bash
cd intelliplace-interview-service
pip install -r requirements.txt
```

**Note**: Some dependencies may require additional system libraries:
- **librosa**: Requires `ffmpeg` for audio processing
- **deepface**: Downloads models on first use (may take time)
- **opencv-python**: May require system libraries

### 2. Environment Variables
Ensure `.env` file in `intelliplace-interview-service` contains:
```
GEMINI_API_KEY=your_gemini_api_key
PORT=8001
```

### 3. Database Migration
```bash
cd intelliplace-backend
npx prisma migrate dev --name add_interview_question_answers
npx prisma generate
```

### 4. Start Services
```bash
# Interview Service
cd intelliplace-interview-service
python app.py

# Backend (in another terminal)
cd intelliplace-backend
npm start

# Frontend (in another terminal)
cd intelliplace-frontend
npm start
```

## Usage Flow

### For Students:
1. Student receives interview notification
2. Student opens interview from MyApplications page
3. Student sees question and clicks "Start Recording"
4. Student records audio/video answer
5. Student clicks "Submit Answer"
6. System analyzes:
   - Converts audio to text
   - Analyzes confidence from audio
   - Detects emotions from video
   - Grades content with Gemini AI
7. Student sees scores and feedback immediately

### For Companies:
1. Company starts interview session
2. Company generates questions
3. Company can view:
   - Student's transcribed answers
   - Analysis scores
   - Emotion data
   - AI feedback

## API Endpoints

### Interview Service (`http://localhost:8001`)

#### POST `/analyze-answer`
```json
{
  "question": "What is your experience with React?",
  "question_index": 0,
  "audio_data": "base64_encoded_audio",
  "video_frames": ["base64_frame1", "base64_frame2"],
  "mode": "TECH"
}
```

Response:
```json
{
  "success": true,
  "data": {
    "question_index": 0,
    "transcribed_text": "I have 2 years of experience...",
    "content_score": 8.5,
    "confidence_score": 7.2,
    "overall_score": 7.8,
    "dominant_emotion": "happy",
    "emotion_scores": {
      "happy": 0.75,
      "neutral": 0.20,
      "sad": 0.05
    },
    "feedback": "The candidate demonstrated good understanding..."
  }
}
```

### Backend (`http://localhost:5000`)

#### POST `/api/jobs/:jobId/interviews/:applicationId/submit-answer`
**Student Submission:**
```json
{
  "questionIndex": 0,
  "audio_data": "base64_audio",
  "video_frames": ["base64_frame1"],
  "question": "Question text"
}
```

**Company Submission:**
```json
{
  "questionIndex": 0,
  "answer": "Text notes about candidate's answer"
}
```

#### GET `/api/jobs/:jobId/interviews/:applicationId/student-session`
Returns interview session with questions for student to answer.

## Scoring System

### Overall Score Calculation:
- **Content Score** (50% weight): Gemini AI evaluation of answer quality
- **Confidence Score** (30% weight): Audio analysis (pitch, energy, clarity)
- **Emotion Score** (20% weight): Positive emotions boost score

### Score Ranges:
- **0-3**: Poor
- **4-6**: Average
- **7-8**: Good
- **9-10**: Excellent

## Troubleshooting

### Audio/Video Recording Issues:
- Ensure browser permissions for microphone and camera
- Use HTTPS or localhost (required for media APIs)
- Check browser console for errors

### Analysis Failures:
- **Speech Recognition**: Requires internet connection for Google API
- **DeepFace**: First run downloads models (~500MB)
- **Librosa**: Requires `ffmpeg` system library

### Performance:
- Video frame analysis limited to first 10 frames
- Audio analysis processes full recording
- Analysis typically takes 10-30 seconds

## Future Enhancements
- Real-time emotion feedback during recording
- Multiple language support for transcription
- Custom scoring weights per interview type
- Video playback for review
- Export analysis reports
