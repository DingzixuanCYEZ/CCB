import { GoogleGenAI, Type } from "@google/genai";
import { Phrase } from '../types';

export const generatePhraseDeck = async (topic: string, count: number = 10): Promise<Omit<Phrase, 'id' | 'consecutiveCorrect' | 'consecutiveWrong' | 'totalReviews'>[]> => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("API Key is missing.");
  }

  const ai = new GoogleGenAI({ apiKey });

  // Explicitly ask for English phrases with Chinese translations
  const prompt = `Generate ${count} useful English phrases or idioms for a Chinese speaker related to the topic: "${topic}". 
  The difficulty should be intermediate to advanced.
  Return the English phrase and its Chinese translation.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              chinese: { type: Type.STRING, description: "The Chinese translation of the phrase" },
              english: { type: Type.STRING, description: "The English phrase or idiom" }
            },
            required: ["chinese", "english"]
          }
        }
      }
    });

    const text = response.text;
    if (!text) return [];
    
    return JSON.parse(text);
  } catch (error) {
    console.error("Gemini API Error:", error);
    throw error;
  }
};