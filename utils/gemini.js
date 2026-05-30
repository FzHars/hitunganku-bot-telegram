const { GoogleGenerativeAI } = require('@google/generative-ai');

let genAI;
function getGenAI() {
  if (!genAI) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY not set');
    genAI = new GoogleGenerativeAI(apiKey);
  }
  return genAI;
}

const SYSTEM_PROMPT = `Kamu adalah asisten keuangan bernama Hitunganku.
RULES:
1. Jawab HANYA tentang pencatatan keuangan
2. TOLAK pertanyaan di luar konteks keuangan
3. Jika user minta mencatat transaksi, extract dalam format JSON:
   {"type": "pengeluaran" atau "pemasukan", "amount": number, "description": "string"}
4. Jika bukan transaksi, balas dengan teks biasa dengan bahasa sopan dan 😄
5. BAHASA Indonesia selalu`;

async function askGemini(userMessage) {
  const model = getGenAI().getGenerativeModel({
    model: 'gemini-3.1-flash-lite',
    systemInstruction: SYSTEM_PROMPT,
  });

  const result = await model.generateContent(userMessage);
  return result.response.text();
}

async function askGeminiWithImage(userMessage, imageBuffer, mimeType) {
  const model = getGenAI().getGenerativeModel({
    model: 'gemini-3.1-flash-lite',
    systemInstruction: SYSTEM_PROMPT,
  });

  const result = await model.generateContent([
    { text: userMessage },
    { inlineData: { data: Buffer.from(imageBuffer).toString('base64'), mimeType } },
  ]);

  return result.response.text();
}

module.exports = { askGemini, askGeminiWithImage };
