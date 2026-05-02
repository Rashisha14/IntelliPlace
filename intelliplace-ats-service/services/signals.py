"""
Resume signals that are not captured well by section parsing (DSA, deployments, etc.).
"""
from __future__ import annotations


COMPETITIVE = (
    "leetcode", "codeforces", "codechef", "hackerrank", "geeksforgeeks",
    "gfg ", " gfg", "hackerearth", "atcoder", "kaggle",
    "data structures", " algorithms", "algorithm", "dsa ",
    "competitive programming", "icpc", "google kick start", "kickstart",
)
DEPLOY = (
    "deployed", "deployment", "production", "live url", "vercel", "netlify",
    "heroku", "aws lambda", "cloudfront", "ci/cd", "github actions", "gitlab ci",
    "docker hub", "kubernetes", "k8s",
)
OPEN_SOURCE = (
    "open source", "github.com/", "gitlab.com/", "contributor", "pull request",
    "merged pr", "oss",
)


def competitive_signal_score(text_lower: str) -> float:
    """Return 0-1 strength from DSA / competitive / practical delivery cues."""
    if not text_lower:
        return 0.0
    score = 0.0
    if any(k in text_lower for k in COMPETITIVE):
        score += 0.5
    if any(k in text_lower for k in DEPLOY):
        score += 0.35
    if any(k in text_lower for k in OPEN_SOURCE):
        score += 0.25
    return float(min(1.0, score))
