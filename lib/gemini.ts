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
    `Analyze this image and determine if it shows a person holding or displaying a handgun, firearm, rifle, knife, bat, or any weapon.
Respond ONLY with valid JSON, no markdown:
{
  "isThreat": true or false,
  "description": "is this person a threat? If so use bullet points starting with - (max 3 points) to describe: what they are doing, weapon type, immediate danger level. If not a threat say '- No threat detected'",
  "appearance": "if a person is visible use bullet points starting with - (max 4 points) covering: clothing colours, hair colour and style, approximate age and build. If no person visible return empty string",
  "hasClearView": true if a person's face or full body is clearly visible and identifiable in the image, false otherwise
}`,
  ]);

  const text = result.response.text().trim();
  return JSON.parse(text);
}
