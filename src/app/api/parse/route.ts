import { NextRequest, NextResponse } from "next/server";
import "pdfjs-dist/legacy/build/pdf.worker.mjs";

// Polyfill browser-only canvas globals that pdf-parse (pdf.js) expects in Node.js
// This MUST run before 'pdf-parse' is imported.
if (typeof globalThis.DOMMatrix === "undefined") {
  (globalThis as any).DOMMatrix = class DOMMatrix {};
}
if (typeof globalThis.ImageData === "undefined") {
  (globalThis as any).ImageData = class ImageData {};
}
if (typeof globalThis.Path2D === "undefined") {
  (globalThis as any).Path2D = class Path2D {};
}

interface Chunk {
  text: string;
  page: number;
}

function chunkText(pageTexts: { page: number; text: string }[]): Chunk[] {
  const chunks: Chunk[] = [];
  const chunkSize = 2000;
  const overlap = 400;

  let currentChunkText = "";
  let currentChunkPage = -1;

  for (const item of pageTexts) {
    const text = item.text.replace(/\s+/g, " ").trim();
    if (!text) continue;

    if (currentChunkPage === -1) {
      currentChunkPage = item.page;
    }

    if (currentChunkText.length > 0) {
      currentChunkText += " " + text;
    } else {
      currentChunkText = text;
    }

    while (currentChunkText.length >= chunkSize) {
      let splitIndex = chunkSize;
      const searchStart = Math.max(0, chunkSize - 150);
      const searchEnd = Math.min(currentChunkText.length, chunkSize + 50);
      const spaceSearchWindow = currentChunkText.substring(searchStart, searchEnd);
      const lastSpaceInWindow = spaceSearchWindow.lastIndexOf(" ");
      
      if (lastSpaceInWindow !== -1) {
        splitIndex = searchStart + lastSpaceInWindow;
      }

      const chunkContent = currentChunkText.substring(0, splitIndex).trim();
      if (chunkContent) {
        chunks.push({
          text: chunkContent,
          page: currentChunkPage
        });
      }

      currentChunkText = currentChunkText.substring(splitIndex - overlap);
      currentChunkPage = item.page;
    }
  }

  if (currentChunkText.trim()) {
    chunks.push({
      text: currentChunkText.trim(),
      page: currentChunkPage !== -1 ? currentChunkPage : 1
    });
  }

  return chunks;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;
    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: buffer });
    const parsedData = await parser.getText();

    const pageTexts: { page: number; text: string }[] = parsedData.pages.map((p: any) => ({
      page: p.num,
      text: p.text
    }));
    
    // Sort pages in order
    pageTexts.sort((a, b) => a.page - b.page);

    // Chunk the text
    const chunks = chunkText(pageTexts);

    if (chunks.length === 0) {
      return NextResponse.json({ error: "No text content found in PDF" }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      filename: file.name,
      pageCount: parsedData.total,
      chunks: chunks
    });

  } catch (error: any) {
    console.error("Error parsing PDF:", error);
    return NextResponse.json({ error: error.message || "Failed to parse PDF" }, { status: 500 });
  }
}
