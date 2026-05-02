"""
Skill normalization utility.
Maps common aliases/abbreviations to canonical ATS skill names.
"""
from __future__ import annotations

from typing import Iterable, List, Set


class SkillNormalizer:
    SKILL_MAP = {
        "js": "javascript",
        "javascript": "javascript",
        "ts": "typescript",
        "typescript": "typescript",
        "node": "node.js",
        "nodejs": "node.js",
        "node.js": "node.js",
        "express": "express.js",
        "express.js": "express.js",
        "reactjs": "react",
        "react.js": "react",
        "next": "next.js",
        "nextjs": "next.js",
        "next.js": "next.js",
        "vue": "vue.js",
        "vuejs": "vue.js",
        "vue.js": "vue.js",
        "postgres": "postgresql",
        "postgresql": "postgresql",
        "py": "python",
        "python3": "python",
        "tf": "tensorflow",
        "pytorch": "pytorch",
        "torch": "pytorch",
        "keras": "keras",
        "sklearn": "scikit-learn",
        "scikit learn": "scikit-learn",
        "ml": "machine learning",
        "dl": "deep learning",
        "ai": "artificial intelligence",
        "genai": "generative ai",
        "llm": "large language models",
        "nlp": "natural language processing",
        "cv": "computer vision",
        "cpp": "c++",
        "c plus plus": "c++",
        "csharp": "c#",
        "c sharp": "c#",
        "go": "go",
        "golang": "go",
        "go lang": "go",
        "mongodb": "mongodb",
        "mongo": "mongodb",
        "aws": "amazon web services",
        "amazon web services": "amazon web services",
        "gcp": "google cloud platform",
        "google cloud": "google cloud platform",
        "azure": "microsoft azure",
        "k8s": "kubernetes",
        "sql": "sql",
        "psql": "postgresql",
        "rest": "rest api",
        "restful": "rest api",
        "graphql": "graphql",
        "dsa": "data structures and algorithms",
        "data structure": "data structures and algorithms",
    }

    def normalize_skill(self, value: str) -> str:
        if not value:
            return ""
        s = " ".join(str(value).strip().lower().replace("/", " ").replace("-", " ").split())
        return self.SKILL_MAP.get(s, s)

    def normalize_skills(self, skills: Iterable[str]) -> List[str]:
        out: List[str] = []
        seen: Set[str] = set()
        for skill in skills or []:
            norm = self.normalize_skill(skill)
            if norm and norm not in seen:
                seen.add(norm)
                out.append(norm)
        return out
