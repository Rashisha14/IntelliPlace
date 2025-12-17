"""
Resume Parsing Service using spaCy
Extracts structured information from resume text
"""

import spacy
import re
from typing import Dict, List
from datetime import datetime

class ResumeParser:
    def __init__(self):
        try:
            # Load spaCy model (install: python -m spacy download en_core_web_sm)
            self.nlp = spacy.load("en_core_web_sm")
        except OSError:
            raise Exception(
                "spaCy model 'en_core_web_sm' not found. "
                "Install it with: python -m spacy download en_core_web_sm"
            )
    
    def parse(self, resume_text: str) -> Dict:
        """
        Parse resume text and extract structured information.
        
        Returns:
            dict with keys: skills, experience_years, education_degree, 
                           project_count, internship_count
        """
        doc = self.nlp(resume_text)
        
        # Extract skills (common technical terms)
        skills = self._extract_skills(doc, resume_text)
        
        # Estimate experience years
        experience_years = self._estimate_experience(doc, resume_text)
        
        # Detect education degree
        education_degree = self._extract_education(doc, resume_text)
        
        # Count projects and internships
        project_count = self._count_projects(resume_text)
        internship_count = self._count_internships(resume_text)
        
        return {
            "skills": skills,
            "experience_years": experience_years,
            "education_degree": education_degree,
            "project_count": project_count,
            "internship_count": internship_count
        }
    
    def _extract_skills(self, doc, text: str) -> List[str]:
        """Extract technical skills from resume."""
        # Common technical skills keywords
        skill_keywords = [
            # Programming Languages
            "python", "java", "javascript", "typescript", "c++", "c#", "go", "rust",
            "php", "ruby", "swift", "kotlin", "scala", "r", "matlab",
            # Web Technologies
            "html", "css", "react", "angular", "vue", "node.js", "express",
            "django", "flask", "spring", "asp.net", "laravel",
            # Databases
            "sql", "mysql", "postgresql", "mongodb", "redis", "oracle",
            # Cloud & DevOps
            "aws", "azure", "gcp", "docker", "kubernetes", "jenkins", "git",
            # Data Science & ML
            "machine learning", "deep learning", "tensorflow", "pytorch",
            "pandas", "numpy", "scikit-learn", "data science",
            # Mobile
            "android", "ios", "react native", "flutter",
            # Other
            "rest api", "graphql", "microservices", "agile", "scrum"
        ]
        
        found_skills = []
        text_lower = text.lower()
        
        for skill in skill_keywords:
            if skill in text_lower:
                found_skills.append(skill.title())
        
        # Also extract noun phrases that might be skills
        for chunk in doc.noun_chunks:
            chunk_text = chunk.text.lower().strip()
            if len(chunk_text.split()) <= 3 and chunk_text not in found_skills:
                # Check if it's a technical term (heuristic)
                if any(char.isupper() for char in chunk.text) or chunk_text in skill_keywords:
                    found_skills.append(chunk.text.strip())
        
        return list(set(found_skills))  # Remove duplicates
    
    def _estimate_experience(self, doc, text: str) -> float:
        """Estimate years of experience from resume text."""
        # Pattern matching for experience indicators
        experience_patterns = [
            r'(\d+)\+?\s*(?:years?|yrs?)\s*(?:of\s*)?(?:experience|exp)',
            r'experience[:\s]+(\d+)\+?\s*(?:years?|yrs?)',
            r'(\d+)\+?\s*(?:years?|yrs?)\s*(?:in|working)',
        ]
        
        years_found = []
        for pattern in experience_patterns:
            matches = re.finditer(pattern, text, re.IGNORECASE)
            for match in matches:
                try:
                    years = float(match.group(1))
                    years_found.append(years)
                except:
                    pass
        
        # If explicit years found, use the maximum
        if years_found:
            return max(years_found)
        
        # Heuristic: Count mentions of "intern", "internship", "work", "job"
        # and estimate based on dates if present
        date_pattern = r'(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{4}|\d{4}'
        dates = re.findall(date_pattern, text, re.IGNORECASE)
        
        if len(dates) >= 2:
            # Try to extract years
            years = []
            for date_str in dates:
                year_match = re.search(r'\d{4}', date_str)
                if year_match:
                    try:
                        years.append(int(year_match.group()))
                    except:
                        pass
            
            if len(years) >= 2:
                experience_range = max(years) - min(years)
                # Cap at reasonable maximum
                return min(experience_range, 10.0)
        
        # Default: assume 0-1 years for campus recruitment
        return 0.5
    
    def _extract_education(self, doc, text: str) -> str:
        """Extract highest education degree mentioned."""
        education_keywords = {
            "phd": ["phd", "ph.d", "doctorate", "doctoral"],
            "master": ["master", "m.tech", "mtech", "m.sc", "msc", "mba", "m.s", "ms"],
            "bachelor": ["bachelor", "b.tech", "btech", "b.e", "be", "b.sc", "bsc", "b.s", "bs", "bachelor's"],
            "diploma": ["diploma"]
        }
        
        text_lower = text.lower()
        
        # Check in order of highest to lowest
        for degree, keywords in education_keywords.items():
            for keyword in keywords:
                if keyword in text_lower:
                    return degree.title()
        
        return "Unknown"
    
    def _count_projects(self, text: str) -> int:
        """Count number of projects mentioned."""
        project_indicators = [
            r'\bproject\s*[#:]?\s*\d+',
            r'project\s*name',
            r'projects?\s*:',
            r'personal\s+project',
            r'academic\s+project'
        ]
        
        count = 0
        for pattern in project_indicators:
            matches = re.findall(pattern, text, re.IGNORECASE)
            count += len(matches)
        
        # Also count numbered project sections
        numbered_projects = re.findall(r'project\s*[#:]?\s*(\d+)', text, re.IGNORECASE)
        if numbered_projects:
            try:
                max_num = max([int(n) for n in numbered_projects])
                count = max(count, max_num)
            except:
                pass
        
        return min(count, 20)  # Cap at reasonable maximum
    
    def _count_internships(self, text: str) -> int:
        """Count number of internships mentioned."""
        internship_patterns = [
            r'internship',
            r'intern\s*[#:]?\s*\d+',
            r'intern\s+at',
            r'summer\s+intern'
        ]
        
        count = 0
        for pattern in internship_patterns:
            matches = re.findall(pattern, text, re.IGNORECASE)
            count += len(matches)
        
        return min(count, 10)  # Cap at reasonable maximum


