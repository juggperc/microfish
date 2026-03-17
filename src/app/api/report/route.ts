import { NextRequest, NextResponse } from "next/server";
import { chatText } from "@/lib/openrouter";
import { SimulationResult, WorldState } from "@/lib/world";

const REPORT_SYSTEM_PROMPT = `You are an expert strategic analyst summarizing a computational agent-based simulation.
You will be provided with the initial World State and the Final Simulation Result (beliefs, polarization, timeline).
You must write a concise, analytic report with the following sections:
- High-level outlook
- Key factions and their behavior
- Points of instability
- What changes could flip the outcome`;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { simulationResult, worldState, question, mode } = body as { simulationResult: SimulationResult, worldState: WorldState, question?: string, mode?: string };

    if (!simulationResult || !worldState) {
      return NextResponse.json({ error: "Missing simulationResult or worldState" }, { status: 400 });
    }

    const contextContext = mode === "crypto" ? "This is a Crypto Market behavior simulation based on real BTC price data." : "This is a geopolitical/social agent-based simulation.";

    const prompt = `Context: ${contextContext}
Original User Question: ${question || "Analyze the simulation results."}

World State:
${JSON.stringify(worldState, null, 2)}

Simulation Results:
${JSON.stringify(simulationResult, null, 2)}

Please generate the analytic report.`;

    const report = await chatText(prompt, REPORT_SYSTEM_PROMPT);

    return NextResponse.json({ report });
  } catch (error: unknown) {
    console.error("Report generation error:", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}