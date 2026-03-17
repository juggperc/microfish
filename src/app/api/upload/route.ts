import { NextRequest, NextResponse } from "next/server";
import { parsePdf } from "@/lib/pdf";
import { chatJson } from "@/lib/openrouter";
import { saveDocument } from "@/lib/db";
import { WorldState } from "@/lib/world";

const EXTRACTION_SYSTEM_PROMPT = `You are an expert geopolitical and strategic analyst.
Your task is to extract a structured "world state" from the provided document text.
Identify key entities (people, orgs, countries), the main issues or tensions, important claims made, the time horizon, and key risks.`;

const SCHEMA_INSTRUCTION = `{
  "entities": [{ "name": "string", "type": "person|org|country|group", "attributes": ["string"] }],
  "issues": [{ "id": "string", "topic": "string", "tension": "string" }],
  "claims": [{ "subject": "string", "predicate": "string", "object": "string", "stance": number (-1 to 1), "uncertainty": number (0 to 1) }],
  "time_horizon": "near|mid|long",
  "risks": [{ "description": "string", "severity": number (1 to 5) }]
}`;

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    
    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const text = await parsePdf(buffer);

    // Limit text to avoid blowing up context window on cheap models, or just send it
    const promptText = text.length > 20000 ? text.substring(0, 20000) + "... (truncated)" : text;

    const worldState = await chatJson<WorldState>(
      `Extract the world state from the following text:\n\n${promptText}`,
      EXTRACTION_SYSTEM_PROMPT,
      SCHEMA_INSTRUCTION
    );

    // Generate a simple ID
    const id = Math.random().toString(36).substring(2, 9);
    
    const record = {
      id,
      filename: file.name,
      worldState,
      extractedAt: new Date().toISOString()
    };
    
    saveDocument(record);

    return NextResponse.json({ documentId: id, worldState });
  } catch (error: unknown) {
    console.error("Upload error:", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}