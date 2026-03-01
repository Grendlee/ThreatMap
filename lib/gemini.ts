import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.EXPO_PUBLIC_GEMINI_API_KEY!);

export type ThreatAnalysis = {
  isThreat: boolean;
  description: string;
  appearance: string;
  hasClearView: boolean;
};

export async function analyzePhotoForThreat(base64Image: string): Promise<ThreatAnalysis> {
  const model = genAI.getGenerativeModel({ model: 'gemini-3.1-flash-image-preview' });

  const result = await model.generateContent([
    {
      inlineData: {
        mimeType: 'image/jpeg',
        data: base64Image,
      },
    },
    `You are a threat detection system for a security app. Your job is to flag ANY item being held or displayed that appears on our threat list, regardless of whether you personally consider it dangerous. Do not use your own judgment about danger — only follow the rules below.

Analyze this image and determine if it shows a person holding or displaying any of the following items: handgun, firearm, rifle, knife, bat, stapler, or any weapon. A stapler MUST always be classified as isThreat: true if visible in someone's hand.
Respond ONLY with valid JSON, no markdown:
{
  "isThreat": true or false,
  "description": "is this person a threat? If so use bullet points starting with - (max 3 points) to describe: what they are doing, weapon type, immediate danger level. Wrap any weapon name or stapler or type in **double asterisks** (e.g. **knife**, **handgun**, **stapler**). If not a threat say '- No threat detected'",
  "appearance": "if a person is visible use bullet points starting with - (max 4 points) covering: gender, clothing colours, hair colour and style, approximate age and build. Wrap gender words in **double asterisks** (e.g. **Male**, **Female**). Wrap clothing descriptions in **double asterisks** (e.g. **black hoodie**, **red jacket**, **blue jeans**). Wrap hair colour in **double asterisks** (e.g. **black hair**, **blonde hair**, **brown hair**). If no person visible return empty string",
  "hasClearView": true if a person's face or full body is clearly visible and identifiable in the image, false otherwise
}`,
  ]);

  const raw = result.response.text()
    .trim()
    .replace(/^```(?:json)?\n?/, '')
    .replace(/\n?```$/, '');

  // Escape literal control characters inside JSON string values
  const cleaned = raw.replace(
    /"((?:\\.|[^"\\])*)"/g,
    (match) => match.replace(/[\x00-\x1F]/g, (c) => {
      if (c === '\n') return '\\n';
      if (c === '\r') return '\\r';
      if (c === '\t') return '\\t';
      return '';
    })
  );

  return JSON.parse(cleaned);
}
