import { GoogleGenerativeAI } from "@google/generative-ai";

/**
 * Retrieves the Google Generative AI client by checking:
 * 1. The custom request header `x-gemini-key` (supplied by user in settings)
 * 2. The server-side environment variable `GEMINI_API_KEY` (supplied by developer)
 */
export function getGeminiClient(request: Request): GoogleGenerativeAI {
  const userApiKey = request.headers.get("x-gemini-key");
  const serverApiKey = process.env.GEMINI_API_KEY;
  
  const apiKey = userApiKey || serverApiKey;
  
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY_MISSING");
  }
  
  return new GoogleGenerativeAI(apiKey);
}

/**
 * Checks if a developer/server key is configured.
 */
export function isServerKeyConfigured(): boolean {
  return !!process.env.GEMINI_API_KEY;
}
