import { NextRequest, NextResponse } from "next/server";
import { chatJson } from "@/lib/openrouter";
import { saveDocument } from "@/lib/db";
import { WorldState } from "@/lib/world";

const EXTRACTION_SYSTEM_PROMPT = `You are an expert quantitative crypto analyst and behavioral economist.
Your task is to extract a structured "market state" from the provided live BTC price history.
Identify key market entities (e.g., whales, retail, miners, institutions), the main issues or tensions (e.g., bearish vs bullish sentiment, high volatility, accumulation), important claims made based on the data, the time horizon, and key risks (e.g., macro shock, liquidation cascade).
Ensure the format perfectly matches the expected JSON schema. Treat "issues" as market topics, and "claims" as stances for or against a bullish/bearish outcome.`;

const SCHEMA_INSTRUCTION = `{
  "entities": [{ "name": "string", "type": "person|org|country|group", "attributes": ["string"] }],
  "issues": [{ "id": "string", "topic": "string", "tension": "string" }],
  "claims": [{ "subject": "string", "predicate": "string", "object": "string", "stance": number (-1 to 1, -1=bearish, 1=bullish), "uncertainty": number (0 to 1) }],
  "time_horizon": "near|mid|long",
  "risks": [{ "description": "string", "severity": number (1 to 5) }]
}`;

export async function POST(req: NextRequest) {
  try {
    // Fetch last 30 days of daily candles for BTCUSDT from Binance API
    const response = await fetch("https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1d&limit=30");
    if (!response.ok) {
      throw new Error(`Failed to fetch BTC data: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    // Binance klines format: [Open time, Open, High, Low, Close, Volume, Close time, Quote asset volume, Number of trades, Taker buy base asset volume, Taker buy quote asset volume, Ignore]
    const priceHistory = data.map((d: any) => {
      const date = new Date(d[0]).toISOString().split('T')[0];
      return `Date: ${date} | Open: $${parseFloat(d[1]).toFixed(2)} | High: $${parseFloat(d[2]).toFixed(2)} | Low: $${parseFloat(d[3]).toFixed(2)} | Close: $${parseFloat(d[4]).toFixed(2)} | Vol: ${parseFloat(d[5]).toFixed(2)} BTC`;
    }).join("\n");

    const promptText = `Here is the live Bitcoin daily price history for the last 30 days:\n\n${priceHistory}\n\nAnalyze this data and extract the current Crypto Market State. Note recent trends, volume spikes, and derive the likely behavioral state of market participants.`;

    const worldState = await chatJson<WorldState>(
      promptText,
      EXTRACTION_SYSTEM_PROMPT,
      SCHEMA_INSTRUCTION
    );

    // Generate a simple ID
    const id = Math.random().toString(36).substring(2, 9);
    
    const record = {
      id,
      filename: "Live BTC Market Data",
      worldState,
      extractedAt: new Date().toISOString()
    };
    
    saveDocument(record);

    return NextResponse.json({ documentId: id, worldState, rawData: priceHistory });
  } catch (error: unknown) {
    console.error("BTC Ingest error:", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
