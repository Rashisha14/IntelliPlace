"""
Section-based resume parser.
Extracts structured fields: skills, experience years, projects count, education.
"""
import re
from typing import Dict

from .skill_normalizer import SkillNormalizer


class ResumeParser:
    SECTION_HEADERS = {
        "skills": ["skills", "technical skills", "tech stack", "competencies"],
        "experience": ["experience", "work experience", "professional experience", "employment"],
        "projects": ["projects", "project experience"],
        "education": ["education", "academic", "qualification", "qualifications"],
    }

    def __init__(self):
        self.skill_normalizer = SkillNormalizer()

    def _normalize_text(self, text: str) -> str:
        return (text or "").replace("\r\n", "\n").replace("\r", "\n")

    def _extract_sections(self, resume_text: str) -> Dict[str, str]:
        text = self._normalize_text(resume_text)
        lower = text.lower()
        markers = []
        for section, keys in self.SECTION_HEADERS.items():
            for key in keys:
                m = re.search(rf"(^|\n)\s*{re.escape(key)}\s*:?\s*(\n|$)", lower)
                if m:
                    markers.append((m.start(), section))
                    break
        markers.sort(key=lambda x: x[0])

        if not markers:
            return {"skills": text, "experience": text, "projects": text, "education": text}

        sections = {k: "" for k in self.SECTION_HEADERS}
        for i, (start, section) in enumerate(markers):
            end = markers[i + 1][0] if i + 1 < len(markers) else len(text)
            sections[section] = text[start:end]
        return sections

    def _extract_skills(self, section_text: str):
        skill_pattern = (
            r"\b(python|java|javascript|js|typescript|ts|react|reactjs|react\.js|node\.?js|node|"
            r"express|nest\.?js|angular|vue\.?js|vue|next\.?js|nuxt|"
            r"c\+\+|cpp|c#|\.net|dotnet|go(?:lang)?|rust|kotlin|swift|scala|ruby|rails|php|laravel|"
            r"sql|postgres|postgresql|mysql|sqlite|redis|elasticsearch|mongodb|mongo|dynamodb|"
            r"aws|gcp|azure|docker|kubernetes|k8s|terraform|ansible|jenkins|"
            r"fastapi|django|flask|spring|spring boot|hibernate|graphql|grpc|kafka|rabbitmq|"
            r"html|css|tailwind|sass|webpack|vite|pandas|numpy|scikit|tensorflow|pytorch|keras|"
            r"opencv|nlp|natural language|computer vision|spark|airflow|dbt|snowflake|bigquery|"
            r"machine learning|deep learning|data science|git|linux|bash|powershell|unit test|pytest)\b"
        )
        found = [m.group(1) for m in re.finditer(skill_pattern, (section_text or "").lower(), re.I)]
        return self.skill_normalizer.normalize_skills(found)

    def _extract_experience_years(self, section_text: str) -> float:
        text = (section_text or "").lower()
        vals = []
        for m in re.finditer(r"(\d+(?:\.\d+)?)\s*[+]?\s*(?:years?|yrs?|yoe)", text):
            try:
                vals.append(float(m.group(1)))
            except Exception:
                pass
        if vals:
            return min(max(vals), 40.0)
        return 0.0

    def _extract_project_count(self, section_text: str) -> int:
        text = (section_text or "").lower()
        bullets = re.findall(r"(^|\n)\s*(?:[-*•]|\d+\.)\s+", text)
        keyword_hits = re.findall(r"\b(project|developed|implemented|built)\b", text)
        cnt = max(len(bullets), len(keyword_hits) // 2)
        return min(max(cnt, 0), 25)

    def _extract_education(self, section_text: str) -> str:
        text = (section_text or "").lower()
        degree_patterns = [
            (r"phd|doctorate", "phd"),
            (r"m\.?tech|mtech|m\.?s\.?|ms|master", "masters"),
            (r"b\.?tech|btech|b\.?e\.?|be|bachelor|b\.?s\.?|bs", "bachelor"),
            (r"mca", "mca"),
            (r"bca", "bca"),
            (r"diploma", "diploma"),
        ]
        for pat, label in degree_patterns:
            if re.search(rf"\b{pat}\b", text):
                return label
        return ""

    def _project_section_text(self, sections: Dict[str, str], full_text: str) -> str:
        block = (sections.get("projects") or "").strip()
        if len(block) < 40:
            return (full_text or "").strip()[:6000]
        return block

    def parse(self, resume_text: str) -> dict:
        text = self._normalize_text(resume_text)
        sections = self._extract_sections(text)

        skills = self._extract_skills(sections.get("skills", text))
        exp_years = self._extract_experience_years(sections.get("experience", text))
        proj_count = self._extract_project_count(sections.get("projects", text))
        intern_count = len(re.findall(r"\bintern(?:ship)?\b", sections.get("experience", text).lower()))
        education_degree = self._extract_education(sections.get("education", text))
        project_text = self._project_section_text(sections, text)

        return {
            "skills": skills,
            "experience_years": exp_years,
            "project_count": proj_count,
            "internship_count": min(intern_count, 8),
            "education_degree": education_degree,
            "project_text": project_text,
            "sections": sections,
            "raw_text": text[:1200] if text else "",
        }
