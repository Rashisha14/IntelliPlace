"""
Generate human-readable explanation for resume evaluation.
"""


class ExplanationGenerator:
    def generate(
        self,
        final_score: float,
        feature_scores,
        decision: str,
        parsed_resume: dict
    ) -> str:
        """Generate explanation string."""
        lines = []
        lines.append(f"Overall score: {final_score * 100:.1f}%")
        lines.append(f"Decision: {decision}")
        lines.append("")
        lines.append("Breakdown:")
        lines.append(f"  - Semantic match with job: {feature_scores.semantic_score * 100:.0f}%")
        lines.append(f"  - Skill match: {feature_scores.skill_match_ratio * 100:.0f}%")
        lines.append(f"  - Experience: {feature_scores.experience_score * 100:.0f}%")
        lines.append(f"  - Projects/Internships: {feature_scores.project_score * 100:.0f}%")
        lines.append(f"  - Education: {feature_scores.education_score * 100:.0f}%")

        skills = parsed_resume.get("skills", [])
        if skills:
            lines.append("")
            lines.append(f"Detected skills: {', '.join(skills[:10])}")

        return "\n".join(lines)
