"""
Semantic similarity between resume and job description.
Uses sentence-transformers for embeddings, falls back to TF-IDF if unavailable.
"""
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity


class SemanticMatcher:
    def __init__(self):
        self._model = None

    def _get_model(self):
        if self._model is None:
            try:
                from sentence_transformers import SentenceTransformer
                self._model = SentenceTransformer('all-MiniLM-L6-v2')
            except Exception:
                self._model = None
        return self._model

    def compute_similarity(
        self,
        resume_text: str,
        job_description: str,
        job_description_pdf_text=None
    ) -> float:
        """Compute semantic similarity between resume and job description (0-1)."""
        resume = (resume_text or "").strip()[:5000]
        job = (job_description or "").strip()
        if job_description_pdf_text:
            job += " " + (job_description_pdf_text or "").strip()
        job = job[:5000] or "job"

        model = self._get_model()
        if model is not None:
            try:
                emb = model.encode([resume, job])
                sim = cosine_similarity([emb[0]], [emb[1]])[0][0]
                return float(max(0, min(1, (sim + 1) / 2)))
            except Exception:
                pass

        # Fallback: TF-IDF cosine similarity
        vectorizer = TfidfVectorizer(max_features=500, stop_words='english')
        try:
            matrix = vectorizer.fit_transform([resume, job])
            sim = cosine_similarity(matrix[0:1], matrix[1:2])[0][0]
            return float(max(0, min(1, sim)))
        except Exception:
            return 0.0

    def compute_pair_similarity(self, text_a: str, text_b: str) -> float:
        """Symmetric similarity between two arbitrary texts (0-1)."""
        a = (text_a or "").strip()[:5000]
        b = (text_b or "").strip()[:5000]
        if not a or not b:
            return 0.0
        model = self._get_model()
        if model is not None:
            try:
                emb = model.encode([a, b])
                sim = cosine_similarity([emb[0]], [emb[1]])[0][0]
                return float(max(0, min(1, (sim + 1) / 2)))
            except Exception:
                pass
        vectorizer = TfidfVectorizer(max_features=500, stop_words="english")
        try:
            matrix = vectorizer.fit_transform([a, b])
            sim = cosine_similarity(matrix[0:1], matrix[1:2])[0][0]
            return float(max(0, min(1, sim)))
        except Exception:
            return 0.0

    def compute_role_similarity(self, resume_text: str, job_title: str) -> float:
        """Compute similarity between resume and job title/role (0-1)."""
        resume = (resume_text or "").strip().lower()[:2000]
        title = (job_title or "").strip().lower()
        if not title:
            return 0.7

        model = self._get_model()
        if model is not None:
            try:
                emb = model.encode([resume, title])
                sim = cosine_similarity([emb[0]], [emb[1]])[0][0]
                return float(max(0, min(1, (sim + 1) / 2)))
            except Exception:
                pass

        # Fallback: keyword overlap
        title_words = set(w for w in title.split() if len(w) > 2)
        resume_words = set(resume.split())
        overlap = len(title_words & resume_words) / max(len(title_words), 1)
        return float(max(0, min(1, overlap * 2)))
