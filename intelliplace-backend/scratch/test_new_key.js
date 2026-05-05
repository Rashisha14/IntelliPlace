import { GoogleGenerativeAI } from '@google/generative-ai';

const apiKey = "AIzaSyBn1H_r617shBRPn3tjExlmsTz4__T5CDE";
const genAI = new GoogleGenerativeAI(apiKey);

async function test() {
  const models = ["gemini-1.5-flash", "gemini-1.5-pro", "gemini-pro"];
  for (const m of models) {
    try {
      console.log(`Testing ${m} with new key...`);
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
