"""
Scoring engine for resume evaluation.
Calculates normalized feature scores and weighted final score.
"""
from __future__ import annotations

from collections import Counter
import re

from .skill_normalizer import SkillNormalizer


class ScoringEngine:
    WEIGHTS = {
        "semantic_score": 0.33,
        "skill_match_ratio": 0.27,
        "experience_score": 0.22,
        "project_score": 0.13,
        "education_score": 0.05,
    }
    FRESHER_WEIGHTS = {
        "semantic_score": 0.34,
        "skill_match_ratio": 0.30,
        "experience_score": 0.08,
        "project_score": 0.23,
        "education_score": 0.05,
    }

    def __init__(self):
        self.skill_normalizer = SkillNormalizer()

    def calculate_skill_match(self, resume_skills: list, required_skills: list) -> float:
        """Skill match ratio using normalized skills: matched/required."""
        if not required_skills:
            return 1.0

        req = set(self.skill_normalizer.normalize_skills(required_skills))
        res = set(self.skill_normalizer.normalize_skills(resume_skills))
        if not req:
            return 1.0

        matches = 0
        for r in req:
            if r in res:
                matches += 1
                continue
            if any(r in rs or rs in r for rs in res):
                matches += 1

        return min(1.0, matches / len(req))

    def calculate_experience_score(
        self,
        experience_years: float,
        min_experience_years: float
    ) -> float:
        """Experience score (0-1). Fresher roles do not penalize zero YOE."""
        if min_experience_years <= 0:
            if experience_years <= 0:
                return 1.0
            return min(1.0, 0.85 + min(0.15, experience_years / 8.0))
        if experience_years >= min_experience_years:
            return 1.0
        return max(0, experience_years / min_experience_years)

    def _count_component(self, project_count: int, internship_count: int) -> float:
        total = (project_count or 0) + (internship_count or 0)
        if total >= 3:
            return 1.0
        if total == 2:
            return 0.82
        if total == 1:
            return 0.65
        return 0.35

    def calculate_project_score(
        self,
        project_count: int,
        internship_count: int,
        project_relevance: float | None = None,
        signal_score: float = 0.0,
    ) -> float:
        """Project/internship score (0-1); optional JD relevance and resume signals."""
        count_score = self._count_component(project_count, internship_count)
        sig = max(0.0, min(1.0, signal_score or 0.0))
        if project_relevance is None:
            return float(min(1.0, 0.82 * count_score + 0.18 * sig))
        rel = max(0.0, min(1.0, project_relevance))
        blended = 0.52 * rel + 0.32 * count_score + 0.16 * sig
        return float(min(1.0, blended))

    def calculate_education_match(
        self,
        resume_degree: str,
        required_degree=None
    ) -> float:
        """Education match score (0-1)."""
        if not required_degree:
            return 0.8 if resume_degree else 0.6
        res = (resume_degree or "").lower()
        req = (required_degree or "").lower()
        if req in res or res in req:
            return 1.0
        degree_order = ["bachelor", "btech", "b.e", "masters", "mtech", "m.s", "phd"]
        res_idx = next((i for i, d in enumerate(degree_order) if d in res), -1)
        req_idx = next((i for i, d in enumerate(degree_order) if d in req), -1)
        if res_idx >= 0 and req_idx >= 0:
            return 1.0 if res_idx >= req_idx else 0.5
        return 0.6

    def calculate_keyword_stuffing_penalty(
        self,
        resume_text: str,
        normalized_resume_skills: list[str]
    ) -> float:
        """
        Penalize obvious keyword spam only (long docs + low lexical diversity or extreme repeats).
        Returns penalty in [0.0, 0.06].
        """
        text = (resume_text or "").lower()
        if not text:
            return 0.0

        tokens = re.findall(r"[a-zA-Z0-9\+\.#]+", text)
        total_tokens = len(tokens)
        if total_tokens == 0:
            return 0.0

        token_counts = Counter(tokens)
        unique = len(set(tokens))
        unique_ratio = unique / max(total_tokens, 1)
        max_freq = max(token_counts.values()) if token_counts else 0
        spam_suspect = (total_tokens >= 2200 and unique_ratio < 0.12) or (
            total_tokens >= 1400 and max_freq >= max(25, int(0.04 * total_tokens))
        )
        if not spam_suspect:
            return 0.0

        repetition_penalty = 0.0
        for skill in normalized_resume_skills or []:
            key = skill.lower().replace(" ", "")
            if not key:
                continue
            occurrences = sum(c for t, c in token_counts.items() if key in t.replace(".", ""))
            ratio = occurrences / total_tokens
            if ratio > 0.10:
                repetition_penalty += min(0.025, (ratio - 0.10) * 0.5)

        return float(min(0.06, max(0.0, repetition_penalty)))

    def apply_rule_based_filters(
        self,
        *,
        candidate_cgpa: float | None = None,
        min_cgpa: float | None = None,
        candidate_backlogs: int | None = None,
        allow_backlogs: bool | None = None,
        max_backlogs: int | None = None,
        resume_degree: str = "",
        required_degree: str | None = None
    ) -> tuple[bool, list[str]]:
        """Return (passes_filters, reasons)."""
        reasons = []

        if min_cgpa is not None and candidate_cgpa is not None and candidate_cgpa < min_cgpa:
            reasons.append(f"CGPA {candidate_cgpa:.2f} is below minimum {min_cgpa:.2f}")

        if candidate_backlogs is not None:
            if allow_backlogs is False and candidate_backlogs > 0:
                reasons.append(f"Backlogs not allowed (found {candidate_backlogs})")
            elif allow_backlogs and max_backlogs is not None and candidate_backlogs > max_backlogs:
                reasons.append(f"Backlogs {candidate_backlogs} exceed maximum {max_backlogs}")

        if required_degree:
            edu_score = self.calculate_education_match(resume_degree, required_degree)
            if edu_score < 0.6:
                reasons.append("Required degree constraint not satisfied")

        return len(reasons) == 0, reasons

    def compute_final_score(
        self,
        feature_scores,
        stuffing_penalty: float = 0.0,
        weights: dict[str, float] | None = None,
    ) -> float:
        """Weighted final score (0-1)."""
        wmap = weights if weights is not None else self.WEIGHTS
        total = 0.0
        for name, weight in wmap.items():
            val = getattr(feature_scores, name, 0)
            total += val * weight
        total -= max(0.0, stuffing_penalty)
        return max(0.0, min(1.0, total))
