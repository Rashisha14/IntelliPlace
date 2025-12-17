"""
Production-grade ATS (Applicant Tracking System) Microservice
Uses spaCy, Sentence-BERT, and scikit-learn for resume evaluation
"""

import os
os.environ['TRANSFORMERS_NO_TF'] = '1'
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from typing import List, Optional
import uvicorn
from services.resume_parser import ResumeParser
from services.semantic_matcher import SemanticMatcher
from services.scoring_engine import ScoringEngine
from services.explanation_generator import ExplanationGenerator

app = FastAPI(
    title="IntelliPlace ATS Service",
    description="AI-powered resume evaluation and candidate ranking",
    version="1.0.0"
)


class ResumeEvaluationRequest(BaseModel):
    resume_text: str = Field(..., description="Full text content of the resume")
    job_description: str = Field(..., description="Complete job description text")
    required_skills: List[str] = Field(default=[], description="List of required technical skills")
    min_experience_years: Optional[float] = Field(default=0.0, description="Minimum years of experience required")
    education_requirement: Optional[str] = Field(default=None, description="Required education degree (e.g., 'Bachelor', 'Master')")


class FeatureScores(BaseModel):
    semantic_similarity: float = Field(..., ge=0.0, le=1.0)
    skill_match_ratio: float = Field(..., ge=0.0, le=1.0)
    experience_score: float = Field(..., ge=0.0, le=1.0)
    project_score: float = Field(..., ge=0.0, le=1.0)
    education_match_score: float = Field(..., ge=0.0, le=1.0)


class ResumeEvaluationResponse(BaseModel):
    final_score: float = Field(..., ge=0.0, le=1.0, description="Weighted final score (0-1)")
    decision: str = Field(..., description="SHORTLISTED, REVIEW, or REJECTED")
    feature_scores: FeatureScores
    explanation: str = Field(..., description="Human-readable explanation of the evaluation")
    parsed_resume: dict = Field(..., description="Structured resume data extracted by NLP")


# Initialize services (singleton pattern)
resume_parser = ResumeParser()
semantic_matcher = SemanticMatcher()
scoring_engine = ScoringEngine()
explanation_generator = ExplanationGenerator()


@app.get("/")
async def root():
    return {
        "service": "IntelliPlace ATS",
        "status": "operational",
        "version": "1.0.0"
    }


@app.get("/health")
async def health_check():
    return {"status": "healthy"}


@app.post("/evaluate-resume", response_model=ResumeEvaluationResponse)
async def evaluate_resume(request: ResumeEvaluationRequest):
    """
    Main endpoint for resume evaluation.
    
    Pipeline:
    1. Parse resume using spaCy (extract skills, experience, education, projects)
    2. Compute semantic similarity between resume and job description
    3. Calculate feature scores (normalized to 0-1)
    4. Apply weighted scoring model
    5. Generate decision and explanation
    """
    try:
        # STEP 1: Resume Parsing
        parsed_resume = resume_parser.parse(request.resume_text)
        
        # STEP 2: Semantic Matching
        semantic_similarity = semantic_matcher.compute_similarity(
            request.resume_text,
            request.job_description
        )
        
        # STEP 3: Feature Engineering
        skill_match_ratio = scoring_engine.calculate_skill_match(
            parsed_resume.get('skills', []),
            request.required_skills
        )
        
        experience_score = scoring_engine.calculate_experience_score(
            parsed_resume.get('experience_years', 0),
            request.min_experience_years
        )
        
        project_score = scoring_engine.calculate_project_score(
            parsed_resume.get('project_count', 0),
            parsed_resume.get('internship_count', 0)
        )
        
        education_match_score = scoring_engine.calculate_education_match(
            parsed_resume.get('education_degree', ''),
            request.education_requirement
        )
        
        # STEP 4: Weighted Scoring
        feature_scores = FeatureScores(
            semantic_similarity=semantic_similarity,
            skill_match_ratio=skill_match_ratio,
            experience_score=experience_score,
            project_score=project_score,
            education_match_score=education_match_score
        )
        
        final_score = scoring_engine.compute_final_score(feature_scores)
        
        # STEP 5: Decision Logic
        if final_score >= 0.75:
            decision = "SHORTLISTED"
        elif final_score >= 0.60:
            decision = "REVIEW"
        else:
            decision = "REJECTED"
        
        # Generate explanation
        explanation = explanation_generator.generate(
            final_score=final_score,
            feature_scores=feature_scores,
            decision=decision,
            parsed_resume=parsed_resume
        )
        
        return ResumeEvaluationResponse(
            final_score=final_score,
            decision=decision,
            feature_scores=feature_scores,
            explanation=explanation,
            parsed_resume=parsed_resume
        )
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error evaluating resume: {str(e)}"
        )


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)

