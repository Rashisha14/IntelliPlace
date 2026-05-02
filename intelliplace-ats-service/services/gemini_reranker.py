"""
Optional Gemini reranker for top candidates.
Returns refined score (0-10) and concise feedback.
"""
from __future__ import annotations

import json
import os
from typing import Optional, Tuple

import requests


class GeminiReranker:
    def __init__(self):
        self.api_key = os.getenv("GEMINI_API_KEY", "").strip()
        self.model = os.getenv("GEMINI_MODEL", "gemini-2.5-flash").strip()
        self.base_url = "https://generativelanguage.googleapis.com/v1beta"

    def is_enabled(self) -> bool:
        return bool(self.api_key)

    def rerank(self, *, resume_text: str, job_description: str) -> Optional[Tuple[float, str]]:
        if not self.is_enabled():
            return None

        prompt = (
            "You are an ATS reranker. Evaluate this resume against the job description.\n"
            "Return ONLY valid JSON with keys: refined_score_10 (number 0-10), feedback (string <= 240 chars).\n\n"
            f"Job Description:\n{(job_description or '')[:5000]}\n\n"
            f"Resume:\n{(resume_text or '')[:7000]}"
        )

        body = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {"temperature": 0.2, "responseMimeType": "application/json"},
        }
        url = f"{self.base_url}/models/{self.model}:generateContent?key={self.api_key}"

        try:
            resp = requests.post(url, json=body, timeout=30)
            if resp.status_code >= 400:
                return None
            data = resp.json()
            text = data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")
            if not text:
                return None
            payload = json.loads(text)
            raw = float(payload.get("refined_score_10", 0.0))
            score_10 = max(0.0, min(10.0, raw))
            feedback = str(payload.get("feedback", "")).strip()[:240]
            return score_10, feedback
        except Exception:
            return None
