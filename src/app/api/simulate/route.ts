import { NextRequest, NextResponse } from "next/server";
import { getDocument } from "@/lib/db";
import { generateAgents, runSimulation } from "@/lib/simulator";
import { SimulationConfig, WorldState } from "@/lib/world";
import { chatJson } from "@/lib/openrouter";

const DELTA_SYSTEM_PROMPT = `You are a simulation engine assistant. The user has provided a new "scenario update" or "delta".
Modify the existing world state based on this new information. Return the FULL updated world state in the same JSON format.
Keep existing entities/issues/claims unless they are directly contradicted. Add new ones if necessary.`;

const SCHEMA_INSTRUCTION = `{
  "entities": [{ "name": "string", "type": "person|org|country|group", "attributes": ["string"] }],
  "issues": [{ "id": "string", "topic": "string", "tension": "string" }],
  "claims": [{ "subject": "string", "predicate": "string", "object": "string", "stance": number (-1 to 1), "uncertainty": number (0 to 1) }],
  "time_horizon": "near|mid|long",
  "risks": [{ "description": "string", "severity": number (1 to 5) }]
}`;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { documentId, config, deltaText } = body as { documentId: string, config: SimulationConfig, deltaText?: string };

    if (!documentId || !config) {
      return NextResponse.json({ error: "Missing documentId or config" }, { status: 400 });
    }

    const doc = getDocument(documentId);
    if (!doc) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    let worldState = doc.worldState;

    if (deltaText && deltaText.trim().length > 0) {
      // Apply scenario update via LLM
      const prompt = `Current World State: ${JSON.stringify(worldState)}\n\nScenario Update: ${deltaText}\n\nReturn the fully updated world state JSON.`;
      worldState = await chatJson<WorldState>(prompt, DELTA_SYSTEM_PROMPT, SCHEMA_INSTRUCTION);
    }

    const agents = generateAgents(worldState, config);
    const result = runSimulation(worldState, config, agents);

    return NextResponse.json({ simulationResult: result, updatedWorld: worldState });
  } catch (error: unknown) {
    console.error("Simulation error:", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}