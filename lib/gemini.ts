import { GoogleGenerativeAI } from '@google/generative-ai';

export const GEMINI_MODEL = 'gemini-2.0-flash';

export function getModel(systemInstruction?: string) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY is not set');
  const genAI = new GoogleGenerativeAI(key);
  return genAI.getGenerativeModel({
    model: GEMINI_MODEL,
    ...(systemInstruction ? { systemInstruction } : {}),
  });
}

export function geminiUsage(meta?: { promptTokenCount?: number; candidatesTokenCount?: number }) {
  return {
    input_tokens: meta?.promptTokenCount || 0,
    output_tokens: meta?.candidatesTokenCount || 0,
  };
}
