import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(apiKey);

async function test() {
  const models = ["gemma-3-27b-it", "gemma-3-4b-it", "gemini-2.5-flash-lite"];
  for (const m of models) {
    try {
      console.log(`Testing ${m}...`);
      const model = genAI.getGenerativeModel({ model: m });
      const result = await model.generateContent("Say hello");
      console.log(`✅ ${m} worked! Response: ${result.response.text()}`);
      return;
    } catch (err) {
      console.log(`❌ ${m} failed: ${err.message}`);
    }
  }
}

test();
