"""
Interview Question Generation Service using Gemini AI
Flask microservice for generating context-aware interview questions
"""

import os
import json
from flask import Flask, request, jsonify
from flask_cors import CORS
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
CORS(app)

# Configure Gemini AI
GEMINI_API_KEY = os.getenv('GEMINI_API_KEY')
if not GEMINI_API_KEY:
    raise ValueError("GEMINI_API_KEY environment variable is required")

genai.configure(api_key=GEMINI_API_KEY)
model = genai.GenerativeModel('gemini-pro')


def generate_tech_question(job_title, job_description, required_skills, candidate_skills=None, previous_questions=None):
    """Generate a technical interview question based on job context"""
    
    context = f"""
    Job Title: {job_title}
    Job Description: {job_description}
    Required Skills: {', '.join(required_skills) if required_skills else 'Not specified'}
    """
    
    if candidate_skills:
        context += f"\nCandidate Skills: {', '.join(candidate_skills)}"
    
    if previous_questions:
        context += f"\nPrevious Questions Asked: {', '.join(previous_questions)}"
    
    prompt = f"""
    You are a technical interviewer conducting an interview for the following position:
    
    {context}
    
    Generate ONE technical interview question that:
    1. Is relevant to the job role and required skills
    2. Tests practical knowledge and problem-solving ability
    3. Is appropriate for a {job_title} position
    4. Is different from any previous questions (if provided)
    5. Can be answered in 2-3 minutes
    
    Return ONLY the question text, nothing else. Make it clear and concise.
    """
    
    try:
        response = model.generate_content(prompt)
        question = response.text.strip()
        return question
    except Exception as e:
        raise Exception(f"Error generating question: {str(e)}")


def generate_hr_question(job_title, job_description, candidate_profile=None, previous_questions=None):
    """Generate an HR/behavioral interview question"""
    
    context = f"""
    Job Title: {job_title}
    Job Description: {job_description}
    """
    
    if candidate_profile:
        context += f"\nCandidate Profile: {candidate_profile}"
    
    if previous_questions:
        context += f"\nPrevious Questions Asked: {', '.join(previous_questions)}"
    
    prompt = f"""
    You are an HR interviewer conducting a behavioral interview for the following position:
    
    {context}
    
    Generate ONE HR/behavioral interview question that:
    1. Assesses soft skills, communication, and cultural fit
    2. Uses the STAR method (Situation, Task, Action, Result) format
    3. Is relevant to the job role
    4. Is different from any previous questions (if provided)
    5. Can be answered in 3-5 minutes
    
    Examples of good HR questions:
    - "Tell me about a time when you had to work under pressure."
    - "Describe a situation where you had to work in a team to achieve a goal."
    - "How do you handle conflicts in the workplace?"
    
    Return ONLY the question text, nothing else. Make it clear and concise.
    """
    
    try:
        response = model.generate_content(prompt)
        question = response.text.strip()
        return question
    except Exception as e:
        raise Exception(f"Error generating question: {str(e)}")


@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        "status": "healthy",
        "service": "IntelliPlace Interview Service",
        "version": "1.0.0"
    })


@app.route('/generate-question', methods=['POST'])
def generate_question():
    """
    Generate an interview question based on mode (Tech or HR)
    
    Request Body:
    {
        "mode": "TECH" or "HR",
        "job_title": "Software Engineer",
        "job_description": "Full job description...",
        "required_skills": ["Python", "React", "Node.js"],
        "candidate_skills": ["Python", "JavaScript"],  # Optional
        "candidate_profile": "Recent graduate with internship experience",  # Optional
        "previous_questions": ["Question 1", "Question 2"]  # Optional
    }
    """
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({"error": "Request body is required"}), 400
        
        mode = data.get('mode', '').upper()
        if mode not in ['TECH', 'HR']:
            return jsonify({"error": "Mode must be 'TECH' or 'HR'"}), 400
        
        job_title = data.get('job_title', '')
        job_description = data.get('job_description', '')
        
        if not job_title or not job_description:
            return jsonify({"error": "job_title and job_description are required"}), 400
        
        required_skills = data.get('required_skills', [])
        candidate_skills = data.get('candidate_skills')
        candidate_profile = data.get('candidate_profile')
        previous_questions = data.get('previous_questions', [])
        
        if mode == 'TECH':
            question = generate_tech_question(
                job_title=job_title,
                job_description=job_description,
                required_skills=required_skills,
                candidate_skills=candidate_skills,
                previous_questions=previous_questions
            )
        else:  # HR mode
            question = generate_hr_question(
                job_title=job_title,
                job_description=job_description,
                candidate_profile=candidate_profile,
                previous_questions=previous_questions
            )
        
        return jsonify({
            "success": True,
            "question": question,
            "mode": mode
        }), 200
        
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": f"Error generating question: {str(e)}"}), 500


@app.route('/', methods=['GET'])
def root():
    """Root endpoint"""
    return jsonify({
        "service": "IntelliPlace Interview Service",
        "status": "operational",
        "version": "1.0.0",
        "endpoints": {
            "health": "/health",
            "generate_question": "/generate-question (POST)"
        }
    })


if __name__ == '__main__':
    port = int(os.getenv('PORT', 8001))
    app.run(host='0.0.0.0', port=port, debug=True)
