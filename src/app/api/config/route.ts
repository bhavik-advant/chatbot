import { NextResponse } from "next/server";
import { isServerKeyConfigured } from "@/utils/gemini";

export async function GET() {
  return NextResponse.json({
    hasServerKey: isServerKeyConfigured()
  });
}
