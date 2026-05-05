import dotenv from 'dotenv';
dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;

async function list() {
  try {
    const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    const data = await resp.json();
    if (data.models) {
      const flashLatest = data.models.find(m => m.name === 'models/gemini-flash-latest');
      console.log('Gemini Flash Latest Details:', JSON.stringify(flashLatest, null, 2));
      const generateModels = data.models
        .filter(m => m.supportedGenerationMethods.includes('generateContent'))
        .map(m => m.name);
      console.log('All Generate Models:', generateModels);
    } else {
      console.log('No models found or error:', data);
    }
  } catch (err) {
    console.error(err);
  }
}

list();
