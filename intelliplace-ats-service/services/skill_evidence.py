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
            continue
        # Two-word stacks often abbreviated in CVs (e.g. "machine learning" → "ml" covered by aliases;
        # this catches cases where JD uses two tokens and CV uses a compact form).
        if len(parts) == 2 and len(parts[0]) > 2 and len(parts[1]) > 2:
            compact = (parts[0][0] + parts[1][0]).lower()
            if len(compact) == 2 and compact in resume_lower.replace(" ", ""):
                hits += 1
    return min(1.0, hits / len(req_norm))


def semantic_skill_alignment(
    matcher: "SemanticMatcher",
    resume_text: str,
    required_skills: list,
    normalizer: SkillNormalizer | None = None,
) -> float:
    """Embedding alignment between resume and a synthesized skills phrase."""
    if not required_skills:
        return 1.0
    if normalizer is not None:
        skills = normalizer.normalize_skills(required_skills)
    else:
        skills = [str(s).strip().lower() for s in required_skills if s]
    blob = "Required technical skills: " + ", ".join(skills[:40])
    if not blob.strip():
        return 1.0
    return matcher.compute_pair_similarity(resume_text, blob)


def blend_skill_match(
    list_ratio: float,
    text_coverage: float,
    semantic_align: float,
    required_skills_nonempty: bool,
    *,
    fresher_role: bool = False,
) -> float:
    """Combine list Jaccard-style match with full-text and semantic evidence."""
    if not required_skills_nonempty:
        return 1.0
    if fresher_role:
        # Student résumés: NLP skill lists miss stack keywords that are clearly in the PDF body.
        lw, tw, sw = 0.20, 0.50, 0.30
    else:
        lw, tw, sw = 0.32, 0.34, 0.34
    combined = lw * list_ratio + tw * text_coverage + sw * semantic_align
    return float(max(0.0, min(1.0, combined)))
