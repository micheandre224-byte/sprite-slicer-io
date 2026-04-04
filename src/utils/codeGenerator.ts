import { GoogleGenAI } from '@google/genai';
import { baseScripts } from './baseScripts';
import { personalizationPrompts } from './prompts';

export type ProgressCallback = (info: { status: string; name?: string; progress?: number }) => void;

// Initialize Gemini API
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function loadModel(onProgress: ProgressCallback) {
  // Since we are using an API now, we don't need to download a heavy local model.
  // We just simulate a quick connection check for UI feedback.
  onProgress({ status: 'initiate', name: 'Gemini 3.1 Flash' });
  
  // Simulate a quick connection delay
  await new Promise(resolve => setTimeout(resolve, 500));
  
  onProgress({ status: 'ready' });
  return true;
}

export function getBaseScript(actionType: string): string {
  return baseScripts[actionType] || baseScripts['walk'];
}

export async function customizeCode(
  actionType: string, 
  baseCode: string, 
  userRequest: string,
  onProgress?: ProgressCallback
): Promise<string> {
  const promptTemplate = personalizationPrompts[actionType] || personalizationPrompts['walk'];
  const prompt = promptTemplate
    .replace('{BASE_CODE}', baseCode)
    .replace('{USER_REQUEST}', userRequest);

  if (onProgress) onProgress({ status: 'generating' });

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        systemInstruction: "Você é um programador sênior especialista em C# e Unity 3D. Sua tarefa é modificar scripts existentes baseado no pedido do usuário. Retorne APENAS o código C# final, sem formatação markdown (```csharp), sem explicações e sem comentários adicionais. O código deve estar pronto para ser copiado e colado na Unity.",
        temperature: 0.2,
      }
    });

    let generatedText = response.text || '';
    
    // Clean up markdown code blocks if present
    generatedText = generatedText.replace(/\`\`\`csharp/gi, '').replace(/\`\`\`/g, '').trim();
    
    return generatedText;
  } catch (error) {
    console.error('Error generating code:', error);
    throw error;
  }
}

export function downloadCode(code: string, filename: string) {
  const blob = new Blob([code], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
