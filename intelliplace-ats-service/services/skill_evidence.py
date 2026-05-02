"""
Evidence-based skill coverage: raw resume text + embeddings beyond parsed skill list.
"""
from __future__ import annotations

from typing import TYPE_CHECKING

from .skill_normalizer import SkillNormalizer

if TYPE_CHECKING:
    from .semantic_matcher import SemanticMatcher


def text_coverage_score(
    resume_lower: str,
    required_skills: list,
    normalizer: SkillNormalizer,
) -> float:
    """Fraction of required skills (and aliases) found as substrings in resume text."""
    if not required_skills:
        return 1.0
    req_norm = normalizer.normalize_skills(required_skills)
    if not req_norm:
        return 1.0
    hits = 0
    for skill in req_norm:
        variants = {skill, skill.replace(" ", ""), skill.replace(" ", "_")}
        for alias, canon in normalizer.SKILL_MAP.items():
            if canon == skill:
                variants.add(alias)
                variants.add(alias.replace(" ", ""))
        if any(len(v) > 1 and v in resume_lower for v in variants):
            hits += 1
            continue
        parts = skill.split()
        if len(parts) > 1 and all(len(p) > 2 and p in resume_lower for p in parts):
            hits += 1
    return min(1.0, hits / len(req_norm))


def semantic_skill_alignment(
    matcher: "SemanticMatcher",
    resume_text: str,
    required_skills: list,
) -> float:
    """Embedding alignment between resume and a synthesized skills phrase."""
    if not required_skills:
        return 1.0
    blob = "Required technical skills: " + ", ".join(str(s).strip() for s in required_skills[:40] if s)
    if not blob.strip():
        return 1.0
    return matcher.compute_pair_similarity(resume_text, blob)


def blend_skill_match(
    list_ratio: float,
    text_coverage: float,
    semantic_align: float,
    required_skills_nonempty: bool,
) -> float:
    """Combine list Jaccard-style match with full-text and semantic evidence."""
    if not required_skills_nonempty:
        return 1.0
    combined = (
        0.32 * list_ratio
        + 0.34 * text_coverage
        + 0.34 * semantic_align
    )
    return float(max(0.0, min(1.0, combined)))
