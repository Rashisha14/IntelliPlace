import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(apiKey);

async function testModels() {
  const models = ["gemini-1.5-flash-latest", "gemini-1.5-pro-latest", "gemini-1.5-flash-001"];
  for (const modelName of models) {
    try {
      console.log(`Testing ${modelName}...`);
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent("Hi");
      console.log(`✅ ${modelName} works!`);
      return;
    } catch (err) {
      console.log(`❌ ${modelName} failed: ${err.message}`);
    }
  }
}

testModels();
