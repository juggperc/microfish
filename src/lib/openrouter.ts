const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "";
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || "openrouter/auto";
const SITE_URL = process.env.OPENROUTER_SITE_URL || "http://localhost:3000";
const SITE_NAME = process.env.OPENROUTER_SITE_NAME || "MicroFish";

async function fetchOpenRouter(messages: { role: string; content: string }[], isJson: boolean = false) {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
      "HTTP-Referer": SITE_URL,
      "X-OpenRouter-Title": SITE_NAME,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      messages,
      response_format: isJson ? { type: "json_object" } : undefined
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter API error: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

export async function chatText(prompt: string, system: string): Promise<string> {
  return fetchOpenRouter([
    { role: "system", content: system },
    { role: "user", content: prompt }
  ], false);
}

export async function chatJson<T>(prompt: string, system: string, schemaInstruction: string): Promise<T> {
  const fullSystem = `${system}\n\nYou MUST return valid JSON. Do not include any markdown formatting like \`\`\`json. Your response must be parseable by JSON.parse().\n\nEXPECTED SCHEMA:\n${schemaInstruction}`;
  const responseText = await fetchOpenRouter([
    { role: "system", content: fullSystem },
    { role: "user", content: prompt }
  ], true);

  try {
    return JSON.parse(responseText) as T;
  } catch {
    // Attempt to strip markdown if the model hallucinated it despite instructions
    const match = responseText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (match) {
      return JSON.parse(match[1]) as T;
    }
    throw new Error("Failed to parse JSON response from OpenRouter");
  }
}