# IntelliPlace ATS Microservice

Production-grade Applicant Tracking System (ATS) for automated resume evaluation and candidate ranking.

## Features

- **Resume Parsing**: Extracts skills, experience, education, and projects using spaCy NLP
- **Semantic Matching**: Uses Sentence-BERT (all-mpnet-base-v2) for semantic similarity between resume and job description
- **Weighted Scoring**: Deterministic, explainable scoring model (no black-box ML)
- **Decision Logic**: Automatically categorizes candidates as SHORTLISTED, REVIEW, or REJECTED
- **Explainable**: Provides detailed breakdown of scores and decision rationale

## Architecture

```
POST /evaluate-resume
    ↓
1. Resume Parsing (spaCy) → Extract structured data
    ↓
2. Semantic Matching (Sentence-BERT) → Compute similarity
    ↓
3. Feature Engineering → Normalize scores (0-1)
    ↓
4. Weighted Scoring → Final score calculation
    ↓
5. Decision Logic → SHORTLISTED/REVIEW/REJECTED
    ↓
6. Explanation Generation → Human-readable summary
```

## Installation

### 1. Install Python Dependencies

```bash
pip install -r requirements.txt
```

### 2. Download spaCy Model

```bash
python -m spacy download en_core_web_sm
```

### 3. Run the Service

```bash
python main.py
```

Or with uvicorn directly:

```bash
uvicorn main:app --host 0.0.0.0 --port 8000
```

The service will be available at `http://localhost:8000`

## API Documentation

Once running, visit:
- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`

## API Endpoint

### POST /evaluate-resume

**Request Body:**
```json
{
  "resume_text": "Full text content of the resume...",
  "job_description": "Complete job description...",
  "required_skills": ["Python", "React", "PostgreSQL"],
  "min_experience_years": 2.0,
  "education_requirement": "Bachelor"
}
```

**Response:**
```json
{
  "final_score": 0.85,
  "decision": "SHORTLISTED",
  "feature_scores": {
    "semantic_similarity": 0.92,
    "skill_match_ratio": 0.80,
    "experience_score": 1.0,
    "project_score": 0.90,
    "education_match_score": 1.0
  },
  "explanation": "Final Score: 85.00%\nDecision: SHORTLISTED\n...",
  "parsed_resume": {
    "skills": ["Python", "React", "JavaScript"],
    "experience_years": 2.5,
    "education_degree": "Bachelor",
    "project_count": 5,
    "internship_count": 2
  }
}
```

## Scoring Model

The final score is computed using weighted features:

- **Semantic Similarity** (40%): Overall fit between resume and job description
- **Skill Match Ratio** (25%): Percentage of required skills found
- **Experience Score** (15%): How well experience meets minimum requirement
- **Project Score** (10%): Number of projects and internships
- **Education Match** (10%): Education level alignment

### Decision Thresholds

- `final_score >= 0.80` → **SHORTLISTED**
- `final_score >= 0.60` → **REVIEW**
- `final_score < 0.60` → **REJECTED**

## Important Notes

1. **Eligibility First**: This service assumes candidates have already passed eligibility checks (CGPA, backlog, etc.). It only ranks eligible candidates.

2. **No Black-Box Decisions**: All scoring is deterministic and explainable. No GPT models make hiring decisions.

3. **Campus Recruitment Focus**: Optimized for campus recruitment scenarios where candidates may have limited work experience.

## Development

### Project Structure

```
intelliplace-ats-service/
├── main.py                 # FastAPI application
├── services/
│   ├── resume_parser.py    # spaCy-based resume parsing
│   ├── semantic_matcher.py # Sentence-BERT similarity
│   ├── scoring_engine.py   # Weighted scoring model
│   └── explanation_generator.py # Explanation generation
├── requirements.txt
└── README.md
```

## Troubleshooting

### spaCy Model Not Found
```bash
python -m spacy download en_core_web_sm
```

### Sentence-BERT Download Issues
The model will download automatically on first use. Ensure you have internet connectivity.

### Memory Issues
For large-scale deployments, consider:
- Using ONNX runtime for faster inference
- Implementing model caching
- Using GPU acceleration (if available)

## License

Part of IntelliPlace Campus Recruitment Platform


