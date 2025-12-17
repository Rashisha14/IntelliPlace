"""
Scoring Engine Service
Normalizes features and computes weighted final score
"""

from typing import Dict
from pydantic import BaseModel
import math

class FeatureScores(BaseModel):
    semantic_similarity: float
    skill_match_ratio: float
    experience_score: float
    project_score: float
    education_match_score: float


class ScoringEngine:
    """
    Deterministic weighted scoring model.
    No black-box ML - all weights are explicit and explainable.
    """
    
    # Weight configuration (must sum to 1.0)
    WEIGHTS = {
        'semantic_similarity': 0.40,  # 40% - Most important: overall fit
        'skill_match_ratio': 0.25,    # 25% - Technical skills alignment
        'experience_score': 0.15,      # 15% - Relevant experience
        'project_score': 0.10,         # 10% - Project/internship count
        'education_match_score': 0.10  # 10% - Education level match
    }
    
    def __init__(self):
        # Verify weights sum to 1.0
        total_weight = sum(self.WEIGHTS.values())
        if abs(total_weight - 1.0) > 0.001:
            raise ValueError(f"Weights must sum to 1.0, got {total_weight}")
    
    def calculate_skill_match(self, resume_skills: list, required_skills: list) -> float:
        """
        Calculate skill match ratio.
        
        Args:
            resume_skills: List of skills found in resume
            required_skills: List of required skills for the job
        
        Returns:
            Ratio between 0 and 1
        """
        if not required_skills:
            return 1.0  # No requirements = perfect match
        
        if not resume_skills:
            return 0.0  # No skills found = no match
        
        # Normalize skill names for comparison
        resume_skills_normalized = [s.lower().strip() for s in resume_skills]
        required_skills_normalized = [s.lower().strip() for s in required_skills]
        
        # Count matches
        matches = 0
        for req_skill in required_skills_normalized:
            # Check exact match or substring match
            for res_skill in resume_skills_normalized:
                if req_skill in res_skill or res_skill in req_skill:
                    matches += 1
                    break
        
        # Return ratio of matched skills
        ratio = matches / len(required_skills_normalized)
        return min(ratio, 1.0)  # Cap at 1.0
    
    def calculate_experience_score(self, resume_experience: float, min_experience: float) -> float:
        """
        Calculate experience score based on how well resume meets minimum requirement.
        
        Args:
            resume_experience: Years of experience found in resume
            min_experience: Minimum years required
        
        Returns:
            Score between 0 and 1
        """
        if min_experience <= 0:
            return 1.0  # No requirement = perfect score
        
        if resume_experience >= min_experience:
            return 1.0  # Meets or exceeds requirement
        
        # Linear scaling: 0 years = 0.0, min_experience = 1.0
        # But cap minimum at 0.2 to give some credit for partial experience
        ratio = resume_experience / min_experience
        return max(0.2, min(ratio, 1.0))
    
    def calculate_project_score(self, project_count: int, internship_count: int) -> float:
        """
        Calculate score based on number of projects and internships.
        
        Args:
            project_count: Number of projects found
            internship_count: Number of internships found
        
        Returns:
            Score between 0 and 1 (normalized)
        """
        # Combine projects and internships
        total_items = project_count + internship_count
        
        # Normalize: 0 items = 0.0, 5+ items = 1.0
        # Using sigmoid-like function for smooth scaling
        if total_items == 0:
            return 0.0
        
        # Linear scaling up to 5 items, then cap at 1.0
        score = min(total_items / 5.0, 1.0)
        return score
    
    def calculate_education_match(self, resume_degree: str, required_degree: str) -> float:
        """
        Calculate education match score.
        
        Args:
            resume_degree: Degree found in resume (e.g., "Bachelor", "Master")
            required_degree: Required degree for the job
        
        Returns:
            Score between 0 and 1
        """
        if not required_degree:
            return 1.0  # No requirement = perfect match
        
        if not resume_degree or resume_degree == "Unknown":
            return 0.5  # Unknown education = neutral score
        
        # Education hierarchy
        education_hierarchy = {
            "diploma": 1,
            "bachelor": 2,
            "master": 3,
            "phd": 4
        }
        
        resume_level = education_hierarchy.get(resume_degree.lower(), 0)
        required_level = education_hierarchy.get(required_degree.lower(), 0)
        
        if resume_level == 0 or required_level == 0:
            # Fallback: string matching
            if required_degree.lower() in resume_degree.lower() or resume_degree.lower() in required_degree.lower():
                return 1.0
            return 0.5
        
        if resume_level >= required_level:
            return 1.0  # Meets or exceeds requirement
        else:
            # Partial credit for being close
            level_diff = required_level - resume_level
            if level_diff == 1:
                return 0.7  # One level below
            else:
                return 0.3  # More than one level below
    
    def compute_final_score(self, feature_scores: FeatureScores) -> float:
        """
        Compute weighted final score.
        
        Args:
            feature_scores: FeatureScores object with all normalized features
        
        Returns:
            Final score between 0 and 1
        """
        final_score = (
            self.WEIGHTS['semantic_similarity'] * feature_scores.semantic_similarity +
            self.WEIGHTS['skill_match_ratio'] * feature_scores.skill_match_ratio +
            self.WEIGHTS['experience_score'] * feature_scores.experience_score +
            self.WEIGHTS['project_score'] * feature_scores.project_score +
            self.WEIGHTS['education_match_score'] * feature_scores.education_match_score
        )
        
        # Ensure score is between 0 and 1
        return max(0.0, min(1.0, final_score))


