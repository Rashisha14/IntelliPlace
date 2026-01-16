import os
import json
import base64
import tempfile
import numpy as np
from flask import Flask, request, jsonify
from flask_cors import CORS
import google.generativeai as genai
from dotenv import load_dotenv
import speech_recognition as sr
import librosa
import cv2
from PIL import Image
import io

# Optional imports - DeepFace may fail on Windows
DEEPFACE_AVAILABLE = False
try:
    from deepface import DeepFace
    DEEPFACE_AVAILABLE = True
except ImportError as e:
    print(f"Warning: DeepFace not available - emotion analysis will be disabled. Error: {e}")
    print("Note: This is common on Windows. The service will still work for other features.")

load_dotenv()

app = Flask(__name__)
CORS(app)


GEMINI_API_KEY = os.getenv('GEMINI_API_KEY')
if not GEMINI_API_KEY:
    raise ValueError("GEMINI_API_KEY environment variable is required")

genai.configure(api_key=GEMINI_API_KEY)
model = genai.GenerativeModel('gemini-2.5-flash')


def generate_tech_question(job_title, job_description, required_skills, candidate_skills=None, previous_questions=None):

    
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
    
    return jsonify({
        "status": "healthy",
        "service": "IntelliPlace Interview Service",
        "version": "2.0.0",
        "features": {
            "speech_to_text": True,
            "audio_analysis": True,
            "emotion_analysis": DEEPFACE_AVAILABLE,
            "content_grading": True
        },
        "deepface_available": DEEPFACE_AVAILABLE
    })


@app.route('/generate-question', methods=['POST'])
def generate_question():
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


def transcribe_audio(audio_data_base64):
    
    try:
        
        audio_bytes = base64.b64decode(audio_data_base64)
        
        
        with tempfile.NamedTemporaryFile(delete=False, suffix='.wav') as tmp_file:
            tmp_file.write(audio_bytes)
            tmp_path = tmp_file.name
        
       
        r = sr.Recognizer()
        with sr.AudioFile(tmp_path) as source:
            audio = r.record(source)
            text = r.recognize_google(audio)
        
       
        os.unlink(tmp_path)
        
        return text
    except Exception as e:
        print(f"Speech recognition error: {str(e)}")
        return None


def analyze_audio_confidence(audio_data_base64):
   
    try:
        
        audio_bytes = base64.b64decode(audio_data_base64)
        
       
        with tempfile.NamedTemporaryFile(delete=False, suffix='.wav') as tmp_file:
            tmp_file.write(audio_bytes)
            tmp_path = tmp_file.name
        
        
        y, sr = librosa.load(tmp_path, sr=None)
        
       
        pitches, magnitudes = librosa.piptrack(y=y, sr=sr)
        pitch_mean = np.mean(pitches[pitches > 0]) if np.any(pitches > 0) else 0
        
       
        rms = librosa.feature.rms(y=y)[0]
        energy_mean = np.mean(rms)
        
       
        zcr = librosa.feature.zero_crossing_rate(y)[0]
        zcr_mean = np.mean(zcr)
        
       
        pitch_score = min(10, (pitch_mean / 200) * 3) if pitch_mean > 0 else 5
        energy_score = min(10, (energy_mean / 0.1) * 5) if energy_mean > 0 else 5
        zcr_score = max(0, 10 - (zcr_mean * 100))
        
        confidence_score = (pitch_score + energy_score + zcr_score) / 3
        
        
        os.unlink(tmp_path)
        
        return {
            "confidence_score": round(confidence_score, 2),
            "pitch_mean": round(float(pitch_mean), 2) if pitch_mean > 0 else 0,
            "energy_mean": round(float(energy_mean), 4),
            "zcr_mean": round(float(zcr_mean), 4)
        }
    except Exception as e:
        print(f"Audio analysis error: {str(e)}")
        return {"confidence_score": 5.0, "error": str(e)}


def analyze_emotions(video_frames_base64):
    
    if not DEEPFACE_AVAILABLE:
        return {
            "emotions": {},
            "dominant_emotion": "neutral",
            "error": "DeepFace not available (TensorFlow issue on Windows). Emotion analysis disabled.",
            "note": "Service is running but emotion detection is unavailable. Other features work normally."
        }
    
    try:
        emotions_list = []
        
        #
        for frame_base64 in video_frames_base64[:10]:  # Limit to first 10 frames
            try:
               
                image_bytes = base64.b64decode(frame_base64)
                image = Image.open(io.BytesIO(image_bytes))
                
                # Convert to numpy array for DeepFace
                img_array = np.array(image)
                
                # Analyze emotions
                result = DeepFace.analyze(
                    img_path=img_array,
                    actions=['emotion'],
                    enforce_detection=False
                )
                
                if isinstance(result, list):
                    result = result[0]
                
                emotions = result.get('emotion', {})
                emotions_list.append(emotions)
            except Exception as e:
                print(f"Frame analysis error: {str(e)}")
                continue
        
        if not emotions_list:
            return {"emotions": {}, "dominant_emotion": "neutral"}
        
        
        avg_emotions = {}
        for emotion in emotions_list[0].keys():
            avg_emotions[emotion] = np.mean([e.get(emotion, 0) for e in emotions_list])
        
        
        dominant_emotion = max(avg_emotions, key=avg_emotions.get)
        
        return {
            "emotions": {k: round(float(v), 2) for k, v in avg_emotions.items()},
            "dominant_emotion": dominant_emotion,
            "frames_analyzed": len(emotions_list)
        }
    except Exception as e:
        print(f"Emotion analysis error: {str(e)}")
        return {"emotions": {}, "dominant_emotion": "neutral", "error": str(e)}


def grade_answer_content(question, answer_text, mode="TECH"):
    
    try:
        prompt = f"""
        You are an expert interviewer evaluating a candidate's answer.
        
        Question: {question}
        Candidate's Answer: {answer_text}
        Interview Mode: {mode}
        
        Evaluate the answer on a scale of 0-10 based on:
        1. Relevance to the question
        2. Depth and detail of the response
        3. Technical accuracy (for TECH mode) or behavioral insight (for HR mode)
        4. Clarity and communication
        5. Completeness
        
        Provide:
        1. A numerical score (0-10, with one decimal place)
        2. Brief feedback (2-3 sentences)
        
        Format your response as JSON:
        {{
            "score": 8.5,
            "feedback": "The candidate demonstrated good understanding..."
        }}
        """
        
        response = model.generate_content(prompt)
        response_text = response.text.strip()
        
        
        if '```json' in response_text:
            response_text = response_text.split('```json')[1].split('```')[0].strip()
        elif '```' in response_text:
            response_text = response_text.split('```')[1].split('```')[0].strip()
        
        result = json.loads(response_text)
        return {
            "content_score": float(result.get("score", 5.0)),
            "feedback": result.get("feedback", "No feedback provided")
        }
    except Exception as e:
        print(f"Content grading error: {str(e)}")
        return {
            "content_score": 5.0,
            "feedback": f"Error in grading: {str(e)}"
        }


@app.route('/analyze-answer', methods=['POST'])
def analyze_answer():
    
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({"error": "Request body is required"}), 400
        
        question = data.get('question', '')
        question_index = data.get('question_index', 0)
        audio_data = data.get('audio_data')
        video_frames = data.get('video_frames', [])
        mode = data.get('mode', 'TECH').upper()
        
        if not question:
            return jsonify({"error": "Question is required"}), 400
        
        results = {
            "question_index": question_index,
            "question": question
        }
        
        
        transcribed_text = None
        if audio_data:
            transcribed_text = transcribe_audio(audio_data)
            results["transcribed_text"] = transcribed_text
        
        
        confidence_analysis = None
        if audio_data:
            confidence_analysis = analyze_audio_confidence(audio_data)
            results["confidence_score"] = confidence_analysis.get("confidence_score", 5.0)
            results["audio_analysis"] = confidence_analysis
        

        emotion_analysis = None
        if video_frames:
            emotion_analysis = analyze_emotions(video_frames)
            results["emotion_scores"] = emotion_analysis.get("emotions", {})
            results["dominant_emotion"] = emotion_analysis.get("dominant_emotion", "neutral")
        
            
        content_grade = None
        if transcribed_text:
            content_grade = grade_answer_content(question, transcribed_text, mode)
            results["content_score"] = content_grade.get("content_score", 5.0)
            results["feedback"] = content_grade.get("feedback", "")
        elif audio_data:
            
            content_grade = grade_answer_content(
                question, 
                "Audio received but transcription unavailable", 
                mode
            )
            results["content_score"] = content_grade.get("content_score", 5.0)
            results["feedback"] = content_grade.get("feedback", "")
        
        
        scores = []
        if results.get("content_score"):
            scores.append(results["content_score"] * 0.5)  # 50% weight
        if results.get("confidence_score"):
            scores.append(results["confidence_score"] * 0.3)  # 30% weight
        if emotion_analysis and emotion_analysis.get("emotions") and not emotion_analysis.get("error"):
            
            positive_emotions = emotion_analysis["emotions"].get("happy", 0) + \
                              emotion_analysis["emotions"].get("neutral", 0) * 0.5
            emotion_score = min(10, (positive_emotions / 100) * 10)
            scores.append(emotion_score * 0.2)  # 20% weight
        elif not emotion_analysis or emotion_analysis.get("error"):
            
            if results.get("content_score"):
                scores.append(results["content_score"] * 0.1)  # Extra 10% to content
            if results.get("confidence_score"):
                scores.append(results["confidence_score"] * 0.1)  # Extra 10% to confidence
        
        overall_score = sum(scores) if scores else 5.0
        results["overall_score"] = round(overall_score, 2)
        
        # Store full analysis data
        results["analysis_data"] = {
            "transcription": transcribed_text,
            "audio_analysis": confidence_analysis,
            "emotion_analysis": emotion_analysis,
            "content_grade": content_grade
        }
        
        return jsonify({
            "success": True,
            "data": results
        }), 200
        
    except Exception as e:
        return jsonify({"error": f"Error analyzing answer: {str(e)}"}), 500


@app.route('/', methods=['GET'])
def root():
    """Root endpoint"""
    return jsonify({
        "service": "IntelliPlace Interview Service",
        "status": "operational",
        "version": "2.0.0",
        "endpoints": {
            "health": "/health",
            "generate_question": "/generate-question (POST)",
            "analyze_answer": "/analyze-answer (POST)"
        }
    })


if __name__ == '__main__':
    port = int(os.getenv('PORT', 8001))
    app.run(host='0.0.0.0', port=port, debug=True)
