/**
 * Default Voice Agent "Settings" message for Deepgram Agent WebSocket (wss://agent.deepgram.com/v1/agent/converse).
 * Override entirely with DEEPGRAM_AGENT_SETTINGS_JSON in .env (single-line JSON).
 */
export const DEFAULT_DEEPGRAM_AGENT_SETTINGS = {
  type: 'Settings',
  audio: {
    input: {
      encoding: 'linear16',
      sample_rate: 48000,
    },
    output: {
      encoding: 'linear16',
      sample_rate: 24000,
      container: 'none',
    },
  },
  agent: {
    speak: {
      provider: {
        type: 'deepgram',
        model: 'aura-2-apollo-en',
      },
    },
    listen: {
      provider: {
        type: 'deepgram',
        version: 'v1',
        model: 'nova-3',
        language: 'en',
        keyterms: ['Internship', 'Project', 'Algorithm', 'Problem Solving'],
      },
    },
    think: {
      provider: {
        type: 'google',
        model: 'gemini-2.5-flash',
        temperature: 0.5,
      },
      prompt: `#Role
You are an AI interviewer conducting a professional job interview for candidates. Your goal is to assess the candidate's skills, clarity, confidence, and relevance of answers.

#General Guidelines
Be professional, calm, and encouraging.
Speak clearly in simple and natural language.
Keep responses short (1–2 sentences, max 120 characters unless needed).
Ask one question at a time.
Do not provide answers or hints.
Do not use markdown, formatting, or special symbols.
If the candidate response is unclear, ask for clarification.
Do not repeat questions.
If the user is silent or gives no response, gently prompt them to continue.

#Voice-Specific Instructions
Speak in a conversational and natural tone.
Pause after asking a question to allow the candidate to respond.
Do not interrupt the candidate while speaking.
Acknowledge answers briefly before moving to the next question.

#Interview Flow
Start with a greeting and introduction.

Step 1: Ask candidate to introduce themselves.
Step 2: Ask 2–3 basic questions related to the role.
Step 3: Ask 2–3 technical or skill-based questions.
Step 4: Ask 1 situational or problem-solving question.
Step 5: Ask 1 behavioral question.

Adjust difficulty based on candidate responses.

#Evaluation Behavior
Silently evaluate the candidate based on:
- Communication clarity
- Technical accuracy
- Confidence
- Relevance to question

Do not reveal scores or evaluation during the interview.

#Handling Responses
If the answer is good:
Acknowledge briefly and move to the next question.

If the answer is weak:
Ask a follow-up question to probe deeper.

If the answer is irrelevant:
Politely redirect to the question.

#Off-Scope Handling
If the candidate asks unrelated questions:
Say: "Let's focus on the interview for now."

#Closing
After completing questions:
Say:
"That concludes the interview. Thank you for your time."

Then ask:
"Do you have any questions for me?"`,
    },
    greeting:
      "Hello. Welcome to the interview session. I will be conducting your interview today. Please feel comfortable and answer confidently. Let's start with your introduction.",
  },
};

function stripEnvQuotes(value) {
  if (value == null) return '';
  const s = String(value).trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1).trim();
  }
  return s;
}

/** @returns {object} Settings JSON for Deepgram Voice Agent */
export function getDeepgramAgentSettings() {
  const raw = stripEnvQuotes(process.env.DEEPGRAM_AGENT_SETTINGS_JSON);
  if (!raw) {
    return DEFAULT_DEEPGRAM_AGENT_SETTINGS;
  }
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      return parsed;
    }
  } catch (e) {
    console.error('[Deepgram agent] DEEPGRAM_AGENT_SETTINGS_JSON is invalid JSON:', e.message);
  }
  return DEFAULT_DEEPGRAM_AGENT_SETTINGS;
}

export const DEEPGRAM_AGENT_WS_URL =
  stripEnvQuotes(process.env.DEEPGRAM_AGENT_WS_URL) || 'wss://agent.deepgram.com/v1/agent/converse';

/** Deepgram Voice Agent rejects oversized Settings / think prompts — stay under a safe limit. */
const MAX_THINK_PROMPT_CHARS = 24000;

function clampThinkPrompt(text) {
  const t = String(text || '');
  if (t.length <= MAX_THINK_PROMPT_CHARS) return t;
  return `${t.slice(0, MAX_THINK_PROMPT_CHARS - 80)}\n\n[Truncated for Voice Agent size limits.]`;
}

/**
 * Deep-clone agent settings and append job/candidate/resume context so the Voice Agent
 * asks questions relevant to this role only (like a real interview).
 * @param {object} settings - from getDeepgramAgentSettings()
 * @param {object} ctx
 */
export function mergeJobContextIntoAgentSettings(settings, ctx) {
  const out = JSON.parse(JSON.stringify(settings));
  const block = buildJobInterviewContextBlock({
    ...ctx,
    maxInterviewAnswers:
      ctx.maxInterviewAnswers != null
        ? Number(ctx.maxInterviewAnswers)
        : parseInt(process.env.INTERVIEW_VOICE_AGENT_MAX_ANSWERS || '8', 10) || 8,
  });
  if (!out.agent) out.agent = {};
  if (!out.agent.think) out.agent.think = {};
  const existing = String(out.agent.think.prompt || '').trim();
  out.agent.think.prompt = clampThinkPrompt(existing ? `${existing}\n\n${block}` : block);

  const title = ctx.jobTitle ? String(ctx.jobTitle).trim() : '';
  if (title && typeof out.agent.greeting === 'string') {
    const g = out.agent.greeting.trim();
    if (!g.toLowerCase().includes(title.toLowerCase().slice(0, 12))) {
      out.agent.greeting = `Hello. Today we are interviewing for the ${title} position. ${g}`;
    }
  }
  return out;
}

/**
 * @param {object} ctx
 * @param {string} ctx.mode — TECH | HR
 * @param {string} ctx.jobTitle
 * @param {string} ctx.jobDescription
 * @param {string} ctx.requiredSkillsText
 * @param {string} ctx.candidateName
 * @param {string} ctx.candidateProfile
 * @param {string} ctx.candidateSkillsText
 * @param {string} ctx.resumeExcerpt
 * @param {number} [ctx.maxInterviewAnswers] — stop after this many candidate answers
 */
export function buildJobInterviewContextBlock(ctx) {
  const mode = String(ctx.mode || 'TECH').toUpperCase();
  const maxAns = Math.min(
    25,
    Math.max(4, Number.isFinite(Number(ctx.maxInterviewAnswers)) ? Number(ctx.maxInterviewAnswers) : 8)
  );
  const jobTitle = String(ctx.jobTitle || 'this role').trim();
  // Keep context rich but bounded — very long prompts cause Voice Agent connection failures.
  const jobDescription = String(ctx.jobDescription || '').trim().slice(0, 4500);
  const requiredSkillsText = String(ctx.requiredSkillsText || 'See job description.').trim().slice(0, 1200);
  const candidateName = String(ctx.candidateName || 'Candidate').trim();
  const candidateProfile = String(ctx.candidateProfile || 'N/A').trim().slice(0, 500);
  const candidateSkillsText = String(ctx.candidateSkillsText || 'Not specified').trim().slice(0, 1200);
  const resumeExcerpt = String(ctx.resumeExcerpt || '').trim().slice(0, 3500);

  const techLine =
    mode === 'TECH'
      ? `For TECH mode you MUST cover ALL of the following across the interview (before the closing):
- At least one question grounded in **resume / past projects / employers** they listed.
- At least **two** questions on **technical or domain skills** required for this role (stack, systems, APIs, data, performance, security, etc.).
- At least **one logical / analytical problem-solving** question (constraints, tradeoffs, debugging mindset, or a small scenario — not a trivia quiz).
- At least **one situational** or **system design** question appropriate to the seniority implied by the role.
- At least **one behavioral** question (ownership, conflict, learning from failure).
- **Do not** skip resume-based follow-ups if the resume excerpt has content.`
      : 'Focus on communication, motivation, teamwork, and situational judgment relevant to this role.';

  return `#Job-specific context (mandatory — highest priority)
You are conducting ONE real hiring interview for THIS job only. **Every question** must be relevant to:
- the **job title** and **job description** below,
- **required skills** for this role,
- and this **candidate's background** (resume excerpt and stated skills when available).

**Position:** ${jobTitle}
**Interview mode:** ${mode}
${techLine}

**Length and stop condition (critical):**
- Aim for **about ${maxAns} substantive exchanges** (one exchange = you ask, they answer). After you have covered the required topics for ${mode} and reached roughly ${maxAns} answers, you MUST deliver the closing line: thank them, say the interview is complete, then ask if they have questions for you — then **stop asking new questions**.
- Do not exceed the scope of a standard interview; do not repeat the same question.

**Job description (anchor all role-specific questions here):**
${jobDescription}

**Required skills / expectations:**
${requiredSkillsText}

**Candidate name:** ${candidateName}
**Application profile:** ${candidateProfile}
**Candidate stated skills:**
${candidateSkillsText}

**Resume / CV excerpt (plain text — ask concrete follow-ups about employers, projects, stack, impact they mention):**
${resumeExcerpt || '(No readable resume text on file — rely on job description, application skills, and their spoken answers.)'}

**Question arc (like a professional interview):**
1. Brief rapport + ask them to introduce themselves in light of this role.
2. Two or three questions grounded in **this job** and **their experience/resume** (not generic trivia).
3. Two or three **technical or domain** questions aligned with required skills and job duties (use TECH depth if mode is TECH).
4. One **situational or logical problem-solving** question realistic for this job.
5. One **behavioral** question.
6. Short follow-ups only to clarify weak answers — stay on-topic.
7. Close professionally; ask if they have questions for you.

Rules: One question at a time. No markdown or bullet symbols when you speak. Do not reveal scoring. Do not give answers to your own questions.`;
}
