import { NextRequest, NextResponse } from "next/server";
import { getGeminiClient } from "@/utils/gemini";

export async function POST(request: NextRequest) {
  try {
    const { text, texts } = await request.json();

    let genAI;
    try {
      genAI = getGeminiClient(request);
    } catch (err: any) {
      return NextResponse.json({ error: "Gemini API key is missing or invalid. Please configure it." }, { status: 401 });
    }

    const model = genAI.getGenerativeModel({ model: "gemini-embedding-001" });

    // Handle batch embedding requests
    if (texts && Array.isArray(texts)) {
      const result = await model.batchEmbedContents({
        requests: texts.map((t: string) => ({
          content: { parts: [{ text: t }], role: "user" },
          model: "models/gemini-embedding-001"
        }))
      });
      return NextResponse.json({
        embeddings: result.embeddings.map((e: any) => e.values)
      });
    }

    // Handle single text embedding requests (backwards compatible)
    if (!text || typeof text !== "string") {
      return NextResponse.json({ error: "Text or texts is required" }, { status: 400 });
    }

    const result = await model.embedContent(text);

    return NextResponse.json({
      embedding: result.embedding.values
    });

  } catch (error: any) {
    console.error("Error generating embedding:", error);
    return NextResponse.json({ error: error.message || "Failed to generate embedding" }, { status: 500 });
  }
}
