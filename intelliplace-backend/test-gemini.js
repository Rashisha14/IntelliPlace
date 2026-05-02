import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.log('No API key found in .env');
  process.exit(1);
}

console.log('Using API Key:', apiKey.substring(0, 10) + '...');

const genAI = new GoogleGenerativeAI(apiKey);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

async function run() {
  try {
    const prompt = `
    Generate exactly 2 multiple-choice questions for an aptitude test.
    The topic/section name is "Quantitative".

    Return ONLY a valid JSON array of objects. Do not include markdown formatting like \`\`\`json.
    Each object must have the following exact schema:
    {
      "questionText": "The question itself",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctIndex": <integer 0-3>,
      "marks": 1
    }
    Make sure all options are plain text. Do not output anything other than the JSON array.
    `;

    const result = await model.generateContent(prompt);
    let text = result.response.text();
    console.log('Raw response:', text);
    text = text.replace(/```json/gi, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(text);
    console.log('Parsed successfully:', parsed.length, 'questions');
  } catch (err) {
    console.error('Error:', err);
  }
}

run();
