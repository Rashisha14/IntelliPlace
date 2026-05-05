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
from services.skill_normalizer import SkillNormalizer
from services.gemini_reranker import GeminiReranker
from services.skill_evidence import (
    blend_skill_match,
    semantic_skill_alignment,
    text_coverage_score,
)
from services.signals import competitive_signal_score

app = FastAPI(
    title="IntelliPlace ATS Service",
    description="AI-powered resume evaluation and candidate ranking",
    version="1.0.0" 
)

# Decision bands on weighted final_score (0–1). Tuned so solid CVs are not all REJECTED.
# Env override: ATS_SHORTLIST_MIN=0.52 ATS_REVIEW_MIN=0.30
def _env_float(name: str, default: float) -> float:
    raw = os.getenv(name)
    if raw is None or str(raw).strip() == "":
        return default
    try:
        return float(raw)
    except ValueError:
        return default


SHORTLIST_SCORE_MIN = _env_float("ATS_SHORTLIST_MIN", 0.52)
REVIEW_SCORE_MIN = _env_float("ATS_REVIEW_MIN", 0.30)


class ResumeEvaluationRequest(BaseModel):
    resume_text: str = Field(..., description="Full text content of the resume")
    job_title: str = Field(..., description="Job title/role (e.g., 'Software Engineer', 'Data Scientist')")
    job_description: str = Field(..., description="Complete job description text")
    job_description_pdf_text: Optional[str] = Field(default=None, description="Text extracted from job description PDF file (if available)")
    required_skills: List[str] = Field(default=[], description="List of required technical skills")
    min_experience_years: Optional[float] = Field(default=0.0, description="Minimum years of experience required")
    education_requirement: Optional[str] = Field(default=None, description="Required education degree (e.g., 'Bachelor', 'Master')")
    min_cgpa: Optional[float] = Field(default=None, description="Minimum CGPA cutoff")
    candidate_cgpa: Optional[float] = Field(default=None, description="Candidate CGPA")
    candidate_backlogs: Optional[int] = Field(default=None, description="Active backlogs count")
    allow_backlogs: Optional[bool] = Field(default=None, description="Whether backlogs are allowed")
    max_backlogs: Optional[int] = Field(default=None, description="Maximum allowed backlogs when allowed")
    use_gemini_rerank: Optional[bool] = Field(default=False, description="Enable optional Gemini reranking")


class FeatureScores(BaseModel):
    semantic: float = Field(..., ge=0.0, le=1.0)
    skills: float = Field(..., ge=0.0, le=1.0)
    experience: float = Field(..., ge=0.0, le=1.0)
    projects: float = Field(..., ge=0.0, le=1.0)
    education: float = Field(..., ge=0.0, le=1.0)


class InternalFeatureScores(BaseModel):
    semantic_score: float = Field(..., ge=0.0, le=1.0)
    skill_match_ratio: float = Field(..., ge=0.0, le=1.0)
    experience_score: float = Field(..., ge=0.0, le=1.0)
    project_score: float = Field(..., ge=0.0, le=1.0)
    education_score: float = Field(..., ge=0.0, le=1.0)


class ResumeEvaluationResponse(BaseModel):
    final_score: float = Field(..., ge=0.0, le=1.0, description="Weighted final score (0-1)")
    decision: str = Field(..., description="SHORTLISTED, REVIEW, or REJECTED")
    feature_scores: FeatureScores
    explanation: str = Field(..., description="Human-readable explanation of the evaluation")
    parsed_resume: dict = Field(..., description="Structured resume data extracted by NLP")
    matched_skills: List[str] = Field(default=[], description="Normalized skills matched to requirements")
    gemini_rerank: Optional[dict] = Field(default=None, description="Optional Gemini rerank result")


# Initialize services (singleton pattern)
resume_parser = ResumeParser()
semantic_matcher = SemanticMatcher()
scoring_engine = ScoringEngine()
explanation_generator = ExplanationGenerator()
skill_normalizer = SkillNormalizer()
gemini_reranker = GeminiReranker()


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
        semantic_score = semantic_matcher.compute_similarity(
            request.resume_text,
            request.job_description,
            request.job_description_pdf_text
        )
        role_similarity = semantic_matcher.compute_role_similarity(
            request.resume_text,
            request.job_title
        )
        # Light title blend — JD similarity stays primary.
        semantic_score = min(1.0, max(0.0, (0.92 * semantic_score) + (0.08 * role_similarity)))

        min_exp = request.min_experience_years
        if min_exp is None:
            min_exp = 0.0
        is_fresher_role = min_exp <= 0.0

        # STEP 3: Feature Engineering
        normalized_resume_skills = skill_normalizer.normalize_skills(parsed_resume.get('skills', []))
        normalized_required_skills = skill_normalizer.normalize_skills(request.required_skills)

        resume_lower = (request.resume_text or "").lower()
        list_skill_ratio = scoring_engine.calculate_skill_match(
            normalized_resume_skills, normalized_required_skills
        )
        text_cov = text_coverage_score(
            resume_lower, request.required_skills or [], skill_normalizer
        )
        sem_skill_align = semantic_skill_alignment(
            semantic_matcher,
            request.resume_text,
            request.required_skills or [],
            skill_normalizer,
        )
        required_nonempty = bool(normalized_required_skills)
        skill_match_ratio = blend_skill_match(
            list_skill_ratio,
            text_cov,
            sem_skill_align,
            required_nonempty,
            fresher_role=is_fresher_role,
        )

        # Fresher CVs are short vs long JDs — cosine similarity undershoots even when keywords align.
        skill_evidence = max(list_skill_ratio, text_cov, sem_skill_align)
        semantic_scored = float(semantic_score)
        if is_fresher_role:
            semantic_scored = min(1.0, 0.38 * semantic_score + 0.62 * skill_evidence)

        experience_score = scoring_engine.calculate_experience_score(
            parsed_resume.get('experience_years', 0),
            min_exp
        )

        jd_for_projects = (request.job_description or "").strip()
        if request.job_description_pdf_text:
            jd_for_projects = (jd_for_projects + " " + (request.job_description_pdf_text or "")).strip()
        project_relevance = semantic_matcher.compute_pair_similarity(
            parsed_resume.get("project_text") or request.resume_text,
            jd_for_projects or request.job_description or "role",
        )
        signal_score = competitive_signal_score(resume_lower)

        project_score = scoring_engine.calculate_project_score(
            parsed_resume.get('project_count', 0),
            parsed_resume.get('internship_count', 0),
            project_relevance=project_relevance,
            signal_score=signal_score,
            is_fresher=is_fresher_role,
        )
        
        education_score = scoring_engine.calculate_education_match(
            parsed_resume.get('education_degree', ''),
            request.education_requirement
        )

        # Keyword stuffing penalty
        stuffing_penalty = scoring_engine.calculate_keyword_stuffing_penalty(
            request.resume_text,
            normalized_resume_skills
        )

        matched_skills = []
        req_set = set(normalized_required_skills)
        res_set = set(normalized_resume_skills)
        for rs in sorted(req_set):
            if rs in res_set or any(rs in s or s in rs for s in res_set):
                matched_skills.append(rs)

        # STEP 4: Weighted Scoring
        internal_scores = InternalFeatureScores(
            semantic_score=semantic_scored,
            skill_match_ratio=skill_match_ratio,
            experience_score=experience_score,
            project_score=project_score,
            education_score=education_score
        )
        
        weight_profile = (
            scoring_engine.FRESHER_WEIGHTS if is_fresher_role else scoring_engine.WEIGHTS
        )
        final_score = scoring_engine.compute_final_score(
            internal_scores,
            stuffing_penalty=stuffing_penalty,
            weights=weight_profile,
        )

        # STEP 4.5: Rule-based hard filters
        passes_filters, filter_reasons = scoring_engine.apply_rule_based_filters(
            candidate_cgpa=request.candidate_cgpa,
            min_cgpa=request.min_cgpa,
            candidate_backlogs=request.candidate_backlogs,
            allow_backlogs=request.allow_backlogs,
            max_backlogs=request.max_backlogs,
            resume_degree=parsed_resume.get('education_degree', ''),
            required_degree=request.education_requirement,
        )
        
        # STEP 5: Decision Logic
        if not passes_filters:
            decision = "REJECTED"
            final_score = min(final_score, 0.55)
        elif final_score >= SHORTLIST_SCORE_MIN:
            decision = "SHORTLISTED"
        elif final_score >= REVIEW_SCORE_MIN:
            decision = "REVIEW"
        else:
            decision = "REJECTED"

        gemini_data = None
        if request.use_gemini_rerank:
            reranked = gemini_reranker.rerank(
                resume_text=request.resume_text,
                job_description=request.job_description
            )
            if reranked:
                refined_10, feedback = reranked
                refined_score = refined_10 / 10.0
                gemini_weight = 0.35
                if REVIEW_SCORE_MIN <= final_score <= 0.82:
                    gemini_weight = 0.42
                final_score = min(
                    1.0,
                    max(0.0, (1.0 - gemini_weight) * final_score + gemini_weight * refined_score),
                )
                gemini_data = {"refined_score_10": refined_10, "feedback": feedback}
                if passes_filters:
                    if final_score >= SHORTLIST_SCORE_MIN:
                        decision = "SHORTLISTED"
                    elif final_score >= REVIEW_SCORE_MIN:
                        decision = "REVIEW"
                    else:
                        decision = "REJECTED"

        external_scores = FeatureScores(
            semantic=semantic_scored,
            skills=skill_match_ratio,
            experience=experience_score,
            projects=project_score,
            education=education_score,
        )

        # Generate explanation
        explanation = explanation_generator.generate(
            final_score=final_score,
            feature_scores=internal_scores,
            decision=decision,
            parsed_resume=parsed_resume
        )
        if filter_reasons:
            explanation += "\n\nRule-based filters:\n- " + "\n- ".join(filter_reasons)
        if stuffing_penalty > 0:
            explanation += f"\n\nKeyword stuffing penalty applied: -{stuffing_penalty * 100:.1f}%"
        
        return ResumeEvaluationResponse(
            final_score=final_score,
            decision=decision,
            feature_scores=external_scores,
            explanation=explanation,
            parsed_resume=parsed_resume,
            matched_skills=matched_skills,
            gemini_rerank=gemini_data
        )
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error evaluating resume: {str(e)}"
        )


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)

