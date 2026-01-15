# IntelliPlace Interview Service

Flask microservice for generating AI-powered interview questions using Google Gemini AI.

## Setup

### 1. Install Dependencies

```bash
pip install -r requirements.txt
```

### 2. Get Gemini API Key

1. Go to [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Create a new API key
3. Copy the API key

### 3. Configure Environment Variables

Create a `.env` file:

```env
GEMINI_API_KEY=your_gemini_api_key_here
PORT=8001
```

### 4. Run the Service

```bash
python app.py
```

The service will run on `http://localhost:8001`

## API Endpoints

### Health Check

```bash
GET /health
```

### Generate Question

```bash
POST /generate-question
Content-Type: application/json

{
  "mode": "TECH",  # or "HR"
  "job_title": "Software Engineer",
  "job_description": "Full job description...",
  "required_skills": ["Python", "React", "Node.js"],
  "candidate_skills": ["Python", "JavaScript"],  # Optional
  "candidate_profile": "Recent graduate...",  # Optional
  "previous_questions": ["Question 1"]  # Optional
}
```

**Response:**

```json
{
  "success": true,
  "question": "Explain the difference between synchronous and asynchronous programming in JavaScript.",
  "mode": "TECH"
}
```

## Modes

- **TECH**: Generates technical questions based on job requirements and skills
- **HR**: Generates behavioral/HR questions using STAR method format
