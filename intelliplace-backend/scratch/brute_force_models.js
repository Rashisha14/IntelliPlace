import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(apiKey);

async function listAndTest() {
  try {
    const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    const data = await resp.json();
    if (!data.models) {
      console.log('No models found:', data);
      return;
    }
    
    const generateModels = data.models
      .filter(m => m.supportedGenerationMethods.includes('generateContent'))
      .map(m => m.name.replace('models/', ''));
    
    console.log(`Found ${generateModels.length} candidate models.`);
    
    for (const m of generateModels) {
      process.stdout.write(`Testing ${m}... `);
      try {
        const model = genAI.getGenerativeModel({ model: m });
        const result = await model.generateContent({ contents: [{ parts: [{ text: "hi" }] }] }, { timeout: 5000 });
        console.log(`✅ WORKS!`);
        console.log(`Response: ${result.response.text()}`);
        return; // Stop at first working model
      } catch (err) {
        if (err.message.includes('403')) {
          console.log(`❌ 403 Forbidden`);
        } else if (err.message.includes('429')) {
          console.log(`❌ 429 Quota Exceeded`);
        } else if (err.message.includes('404')) {
          console.log(`❌ 404 Not Found`);
        } else {
          console.log(`❌ Error: ${err.message.substring(0, 50)}...`);
        }
      }
    }
  } catch (err) {
    console.error('Fatal error:', err);
  }
}

listAndTest();
