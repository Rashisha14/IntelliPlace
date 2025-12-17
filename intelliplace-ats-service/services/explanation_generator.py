"""
Explanation Generator Service
Creates human-readable explanations of ATS decisions
"""

from typing import Dict
from pydantic import BaseModel

class ExplanationGenerator:
    """
    Generates explainable summaries of ATS evaluation.
    No GPT/LLM - uses deterministic template-based generation.
    """
    
    def generate(
        self,
        final_score: float,
        feature_scores,
        decision: str,
        parsed_resume: Dict
    ) -> str:
        """
        Generate human-readable explanation of the evaluation.
        
        Args:
            final_score: Final weighted score (0-1)
            feature_scores: FeatureScores object
            decision: SHORTLISTED, REVIEW, or REJECTED
            parsed_resume: Parsed resume data
        
        Returns:
            Explanation string
        """
        explanation_parts = []
        
        # Overall decision
        explanation_parts.append(f"Final Score: {final_score:.2%}")
        explanation_parts.append(f"Decision: {decision}")
        explanation_parts.append("")
        
        # Feature breakdown
        explanation_parts.append("Score Breakdown:")
        explanation_parts.append(f"  • Semantic Similarity: {feature_scores.semantic_similarity:.2%} (40% weight)")
        explanation_parts.append(f"  • Skill Match: {feature_scores.skill_match_ratio:.2%} (25% weight)")
        explanation_parts.append(f"  • Experience: {feature_scores.experience_score:.2%} (15% weight)")
        explanation_parts.append(f"  • Projects/Internships: {feature_scores.project_score:.2%} (10% weight)")
        explanation_parts.append(f"  • Education Match: {feature_scores.education_match_score:.2%} (10% weight)")
        explanation_parts.append("")
        
        # Resume insights
        explanation_parts.append("Resume Analysis:")
        if parsed_resume.get('skills'):
            skills_count = len(parsed_resume['skills'])
            explanation_parts.append(f"  • Found {skills_count} technical skills")
        else:
            explanation_parts.append("  • Limited technical skills detected")
        
        exp_years = parsed_resume.get('experience_years', 0)
        explanation_parts.append(f"  • Estimated experience: {exp_years:.1f} years")
        
        education = parsed_resume.get('education_degree', 'Unknown')
        explanation_parts.append(f"  • Education level: {education}")
        
        project_count = parsed_resume.get('project_count', 0)
        internship_count = parsed_resume.get('internship_count', 0)
        explanation_parts.append(f"  • Projects: {project_count}, Internships: {internship_count}")
        explanation_parts.append("")
        
        # Decision rationale
        if decision == "SHORTLISTED":
            explanation_parts.append("Rationale: Candidate demonstrates strong alignment with job requirements across multiple dimensions.")
        elif decision == "REVIEW":
            explanation_parts.append("Rationale: Candidate shows potential but may require manual review for specific fit.")
        else:
            explanation_parts.append("Rationale: Candidate does not meet the minimum scoring threshold for automatic shortlisting.")
        
        return "\n".join(explanation_parts)


