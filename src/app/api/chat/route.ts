import { NextRequest, NextResponse } from "next/server";
import { getGeminiClient } from "@/utils/gemini";

export async function POST(request: NextRequest) {
  try {
    const { question, context, history } = await request.json();

    if (!question || typeof question !== "string") {
      return NextResponse.json({ error: "Question text is required" }, { status: 400 });
    }

    if (!context || !Array.isArray(context)) {
      return NextResponse.json({ error: "Context chunks are required" }, { status: 400 });
    }

    // Initialize Gemini Client
    let genAI;
    try {
      genAI = getGeminiClient(request);
    } catch (err: any) {
      return NextResponse.json({ error: "Gemini API key is missing or invalid. Please configure it." }, { status: 401 });
    }

    // Format context for system instruction
    const contextText = context
      .map((c: any) => `[Source Page ${c.page}]:\n${c.text}`)
      .join("\n\n");

    const systemInstruction = `You are a professional, helpful PDF Chatbot assistant. Your goal is to answer the user's questions based strictly on the provided context retrieved from their uploaded PDF document.

Here is the retrieved context from the PDF:
-------------------------------------------
${contextText}
-------------------------------------------

Instructions:
1. Answer the question as accurately, factually, and completely as possible, based ONLY on the context provided above.
2. If the context does not contain the answer or is unrelated to the question, state clearly: "I cannot find the answer to this in the uploaded PDF." Do not try to make up information or use external knowledge.
3. Be professional and output clear markdown syntax.
4. When citing facts, mention which Page they come from (e.g., "Based on Page 5..."). Use square brackets for citation reference numbers if helpful (e.g. "[Page X]").
`;

    const model = genAI.getGenerativeModel({
      model: "gemini-3.5-flash",
      systemInstruction: systemInstruction,
    });

    // Map history to Gemini API format
    const contents: any[] = [];
    if (history && Array.isArray(history)) {
      for (const msg of history) {
        // Only include completed messages
        if (!msg.content) continue;
        contents.push({
          role: msg.role === "assistant" || msg.role === "model" ? "model" : "user",
          parts: [{ text: msg.content }]
        });
      }
    }

    // Push the current user query
    contents.push({
      role: "user",
      parts: [{ text: question }]
    });

    const result = await model.generateContentStream({ contents });

    // Stream the response back to the client
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of result.stream) {
            const text = chunk.text();
            controller.enqueue(encoder.encode(text));
          }
          controller.close();
        } catch (err) {
          controller.error(err);
        }
      }
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Transfer-Encoding": "chunked"
      }
    });

  } catch (error: any) {
    console.error("Error generating response stream:", error);
    return NextResponse.json({ error: error.message || "Failed to generate chat response" }, { status: 500 });
  }
}
