import axios from 'axios';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
// Try these in order; 404 often means model deprecated for this API key
const GEMINI_MODELS = (process.env.GEMINI_MODEL || 'gemini-2.5-flash,gemini-2.0-flash,gemini-1.5-flash').split(',');
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';

/**
 * Generate coding test cases using Gemini AI based on question details
 * @param {Object} params
 * @param {string} params.title - Question title
 * @param {string} params.description - Problem description
 * @param {string} [params.constraints] - Optional constraints
 * @param {Array<{input: string, output: string}>} [params.sampleCases] - Optional sample cases for reference
 * @param {number} [params.count] - Number of test cases to generate (default 5)
 * @returns {Promise<{testCases: string[], expectedOutputs: string[], sampleCases?: Array<{input: string, output: string}>}>}
 */
export async function generateTestCases({ title, description, constraints = '', sampleCases = [], count = 5 }) {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not configured. Add it to your .env file.');
  }

  const sampleContext = sampleCases.length > 0
    ? `\n\nExample sample cases (for reference, include similar style):\n${sampleCases.map((sc, i) => `Sample ${i + 1}:\nInput: ${sc.input}\nExpected Output: ${sc.output}`).join('\n\n')}`
    : '';

  const prompt = `You are an expert at creating programming test cases for coding assessments.

Generate ${count} test cases (input + expected output pairs) for the following coding problem.

**Title:** ${title}

**Problem Description:**
${description}
${constraints ? `\n**Constraints:**\n${constraints}` : ''}
${sampleContext}

**Requirements:**
- Create diverse test cases: edge cases, typical cases, and boundary conditions
- Input and output must be exact strings as they would appear in stdin/stdout
- For multi-line input/output, use \\n for newlines within the string
- Return ONLY valid JSON, no markdown or explanation
- Format: {"testCases": ["input1", "input2", ...], "expectedOutputs": ["output1", "output2", ...]}
- Optionally include 1-2 sample cases (visible to students) in: "sampleCases": [{"input": "...", "output": "..."}]

Return the JSON object only:`;

  const makeRequest = async (url) => {
    const body = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 4096, responseMimeType: 'application/json' }
    };
    const config = { headers: { 'Content-Type': 'application/json' }, timeout: 60000 };
    return axios.post(url, body, config);
  };

  let lastError = null;
  for (const model of GEMINI_MODELS) {
    try {
      const url = `${GEMINI_BASE}/models/${model.trim()}:generateContent?key=${GEMINI_API_KEY}`;
      let response;
      try {
        response = await makeRequest(url);
      } catch (rateErr) {
        if (rateErr.response?.status === 429) {
          const retryAfter = rateErr.response?.headers?.['retry-after'];
          const waitSec = retryAfter ? Math.min(parseInt(retryAfter, 10) || 60, 120) : 60;
          await new Promise(r => setTimeout(r, waitSec * 1000));
          try {
            response = await makeRequest(url);
          } catch (retryErr) {
            if (retryErr.response?.status === 429) {
              throw new Error('Gemini rate limit exceeded. Please wait 1–2 minutes and try again.');
            }
            throw retryErr;
          }
        } else {
          throw rateErr;
        }
      }

      const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        throw new Error('Empty response from Gemini');
      }

      // Parse JSON - handle possible markdown code block
      let jsonStr = text.trim();
      const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1].trim();
      }

      const parsed = JSON.parse(jsonStr);

      const testCases = Array.isArray(parsed.testCases) ? parsed.testCases : [];
      const expectedOutputs = Array.isArray(parsed.expectedOutputs) ? parsed.expectedOutputs : [];
      const sampleCasesOut = Array.isArray(parsed.sampleCases) ? parsed.sampleCases : [];

      // Ensure arrays match in length (pair input with output)
      const len = Math.min(testCases.length, expectedOutputs.length);
      const validTestCases = testCases.slice(0, len).map(String);
      const validExpectedOutputs = expectedOutputs.slice(0, len).map(String);

      return {
        testCases: validTestCases.length > 0 ? validTestCases : [''],
        expectedOutputs: validExpectedOutputs.length > 0 ? validExpectedOutputs : [''],
        sampleCases: sampleCasesOut.filter(sc => sc?.input != null && sc?.output != null)
          .map(sc => ({ input: String(sc.input), output: String(sc.output) }))
      };
    } catch (err) {
      lastError = err;
      if (err.response?.status === 404) {
        continue; // Try next model
      }
      throw err;
    }
  }

  // All models failed with 404
  throw new Error('Gemini model not found. Add GEMINI_MODEL=gemini-1.5-flash to .env and restart.');
}

/**
 * @typedef {{ question: string, answer: string }} InterviewTurn
 */

/**
 * Generate one interview question: opens with personality, then adapts to prior Q&A.
 * @param {Object} params
 * @param {'TECH'|'HR'} params.mode
 * @param {string} params.jobTitle
 * @param {string} params.jobDescription
 * @param {string[]} params.requiredSkills
 * @param {string[]|null} params.candidateSkills
 * @param {string} params.resumeExcerpt
 * @param {string} params.candidateName
 * @param {string[]} params.previousQuestions - Titles only; used to avoid duplicates
 * @param {InterviewTurn[]} params.conversationHistory - Ordered Q&A so far (what they actually said)
 * @param {number} params.nextQuestionIndex - 0 = first question of this session
 * @returns {Promise<string>} A single interview question
 */
export async function generateInterviewQuestion({
  mode,
  jobTitle,
  jobDescription,
  requiredSkills = [],
  candidateSkills = null,
  resumeExcerpt = '',
  candidateName = 'Candidate',
  previousQuestions = [],
  conversationHistory = [],
  nextQuestionIndex = 0,
}) {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not configured. Add it to your .env file.');
  }

  const skillsStr = Array.isArray(requiredSkills) && requiredSkills.length
    ? requiredSkills.join(', ')
    : 'Not specified';
  const candSkillsStr = Array.isArray(candidateSkills) && candidateSkills.length
    ? candidateSkills.join(', ')
    : 'See profile / resume below';

  const prevTitles = previousQuestions.filter(Boolean).length
    ? `\n\nQuestion topics already used (do not repeat or lightly rephrase the same ask):\n${previousQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}`
    : '';

  const transcript =
    Array.isArray(conversationHistory) && conversationHistory.length > 0
      ? `\n\n--- Conversation so far (use this; reference their answers naturally) ---\n${conversationHistory
          .map(
            (turn, i) =>
              `Turn ${i + 1}\nInterviewer: ${turn.question}\nCandidate (${candidateName}): ${turn.answer}`
          )
          .join('\n\n')}`
      : '\n\n--- No prior turns yet — this is the opening question. ---';

  const resumeTrim = resumeExcerpt ? resumeExcerpt.trim().slice(0, 12000) : '';
  const hasResumeText = resumeTrim.length > 0;
  const resumeBlock = hasResumeText
    ? `\n\n--- Candidate resume / CV (plain-text excerpt — mine this for employers, roles, projects, stack, education, certifications) ---\n${resumeTrim}`
    : '\n\n(No plain-text resume excerpt on file — use **Candidate stated skills** and the job description; ask how their listed skills map to real work.)';

  const hasTranscript =
    Array.isArray(conversationHistory) && conversationHistory.some((t) => t?.answer?.trim());

  const resumeGrounding = hasResumeText
    ? `RESUME-GROUNDED QUESTIONS (mandatory when the excerpt has content):
- Draw from **work experience** (employers, titles, dates), **projects** (name, tech, outcome), **skills** (languages, frameworks, tools), and **education** listed above.
- Prefer questions that mention something concrete they wrote in the resume (a company, project, or stack) rather than only generic "tell me about yourself."
- Rotate topics across the interview: experience → projects → depth on a skill → education/certifications → fit for this role — so you are not stuck in one lane.
- If they listed multiple projects, explore different ones across turns; follow up on impact, tradeoffs, and what they personally built vs collaborated on.`
    : `RESUME-GROUNDED QUESTIONS (no full excerpt — skills-only mode):
- Use **Candidate stated skills** and the job’s required skills; ask for examples of where they used those skills in practice (coursework, internships, personal projects, or work).`;

  const arcInstructions = (() => {
    const i = nextQuestionIndex;
    if (mode === 'HR') {
      if (i <= 2) {
        return `INTERVIEW ARC (HR — opening): Warm, conversational. Still **tie the question to their resume or stated background** when possible — e.g. a past role, degree, volunteer work, or skill they listed — then ask about motivation, teamwork, communication, or values in that context.`;
      }
      return `INTERVIEW ARC (HR — depth): Go deeper on behavior and situations. Prefer follow-ups anchored in **their resume or prior answers** (specific employer, project, or claim). Probe specifics, tradeoffs, and reflection.`;
    }

    // TECH — still ramp difficulty, but always invite resume-backed specifics early
    if (i === 0) {
      return `INTERVIEW ARC (Technical — opening): Opening question must **connect to their real background**. If the resume excerpt lists jobs, projects, or skills, ask about one of those concretely (e.g. "Walk me through [project X]…" or "You listed [skill Y] — where did you apply it?"). If the excerpt is empty, connect **Candidate stated skills** to a real example. Still no coding puzzles or trivia — conversational depth on what they actually did.`;
    }
    if (i === 1) {
      return `INTERVIEW ARC (Technical — early): Ask about **another line from the resume** — different project, internship, or skill — or behavioral collaboration/feedback in the context of work or projects they listed. No whiteboard drills yet; stay story- and resume-grounded.`;
    }
    if (i === 2 || i === 3) {
      return `INTERVIEW ARC (Technical — transition): Connect **documented experience** to "${jobTitle}" — tools, domains, projects, how they learn. Reference employers or stack from the resume when possible; stay conversational (storytelling, not an exam).`;
    }
    if (i === 4 || i === 5) {
      return `INTERVIEW ARC (Technical — bridge): Situational and "how would you think about…" tied to the role. **Prioritize threads from the resume or transcript** (project, system, or skill they named) before inventing a new abstract scenario.`;
    }
    return `INTERVIEW ARC (Technical — depth): Role-specific technical depth — implementation, constraints, failure modes, testing. Tie questions to **what they claimed on the resume or in the transcript** when you can (e.g. "You mentioned X — how would you…?").`;
  })();

  const followUpRule = hasTranscript
    ? `FOLLOW-UP DISCIPLINE (transcript is non-empty): A strong real interview often picks up the thread from what they JUST said or from an earlier answer. Unless you are explicitly in the very first question of the session, prefer a question that either: (a) drills deeper into something they claimed, with a concrete hook from their words, or (b) bridges from their answer into slightly more technical or role-specific territory — not a random new topic every time.`
    : `The candidate has not answered anything yet — this question stands alone (opening or early rapport).`;

  const techCap = parseInt(process.env.INTERVIEW_TECH_MAX_QUESTIONS || '12', 10);
  const finalQuestionNote =
    mode === 'TECH' && nextQuestionIndex >= techCap - 1
      ? `\n- **Last question of session** (technical cap ≈ ${techCap}): Cover any remaining job-critical angle; sound like a natural closing probe — do not imply that more questions will follow.`
      : '';

  const prompt = `You are a senior interviewer running a real conversation, not a quiz. Pace matters: learn the person through **their real experience and resume**, then deepen.

${resumeGrounding}

${arcInstructions}

${followUpRule}

**Interview mode:** ${mode}

**Job title:** ${jobTitle}

**Job description (use more as the arc progresses; tie examples to it when relevant):**
${jobDescription}

**Required skills for the role:** ${skillsStr}

**Candidate name:** ${candidateName}
**Candidate stated skills (from application — cross-check with resume excerpt):** ${candSkillsStr}
${resumeBlock}
${transcript}
${prevTitles}

Rules:
- One clear question only; no "Question 5:" preamble; no numbering in the text; max 130 words.
- Sound spoken and natural, not like a form field.
- Address the candidate by name **${candidateName}** exactly as written (same spelling and spacing) when you use their name in the question. If the name is literally "Candidate" or empty, do not force a fake name.
- When resume text or skills list gives you hooks, **use them by name or clear reference** (company, project, tool, course) — do not ignore listed experience, projects, or skills unless you already exhausted them in prior questions.${finalQuestionNote}
- Return ONLY valid JSON with shape: {"question":"<the question text>"}`;

  const makeRequest = async (url) => {
    const body = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.58,
        maxOutputTokens: 1024,
        responseMimeType: 'application/json',
      },
    };
    return axios.post(url, body, { headers: { 'Content-Type': 'application/json' }, timeout: 60000 });
  };

  let lastError = null;
  for (const model of GEMINI_MODELS) {
    try {
      const url = `${GEMINI_BASE}/models/${model.trim()}:generateContent?key=${GEMINI_API_KEY}`;
      const response = await makeRequest(url);
      const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error('Empty response from Gemini');

      let jsonStr = text.trim();
      const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) jsonStr = jsonMatch[1].trim();

      const parsed = JSON.parse(jsonStr);
      const q = typeof parsed.question === 'string' ? parsed.question.trim() : '';
      if (!q) throw new Error('Invalid question in Gemini response');
      return q;
    } catch (err) {
      lastError = err;
      if (err.response?.status === 404) continue;
      throw err;
    }
  }

  throw lastError || new Error('Gemini interview question generation failed');
}
