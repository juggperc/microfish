import { z } from "zod";

export const EntitySchema = z.object({
  name: z.string(),
  type: z.enum(["person", "org", "country", "group"]),
  attributes: z.array(z.string()),
});

export const IssueSchema = z.object({
  id: z.string(),
  topic: z.string(),
  tension: z.string(),
});

export const ClaimSchema = z.object({
  subject: z.string(),
  predicate: z.string(),
  object: z.string(),
  stance: z.number().describe("-1 (strongly against) to 1 (strongly for)"),
  uncertainty: z.number().describe("0 (certain) to 1 (completely uncertain)"),
});

export const RiskSchema = z.object({
  description: z.string(),
  severity: z.number().min(1).max(5),
});

export const WorldStateSchema = z.object({
  entities: z.array(EntitySchema),
  issues: z.array(IssueSchema),
  claims: z.array(ClaimSchema),
  time_horizon: z.enum(["near", "mid", "long"]),
  risks: z.array(RiskSchema),
});

export type Entity = z.infer<typeof EntitySchema>;
export type Issue = z.infer<typeof IssueSchema>;
export type Claim = z.infer<typeof ClaimSchema>;
export type Risk = z.infer<typeof RiskSchema>;
export type WorldState = z.infer<typeof WorldStateSchema>;

export interface DocumentRecord {
  id: string;
  filename: string;
  worldState: WorldState;
  extractedAt: string;
}

export const AgentGroupSchema = z.enum(["government", "public", "military", "business", "ngo", "media", "whale", "retail", "miner", "institution", "bot"]);
export type AgentGroup = z.infer<typeof AgentGroupSchema>;

export interface Agent {
  id: string;
  group: AgentGroup;
  ideology: {
    statusQuo: number;
    change: number;
    hawkish: number;
    dovish: number;
  };
  beliefs: Record<string, number>; // issueId -> -1 to 1
  confidence: number; // 0 to 1
  trust: Record<string, number>; // group -> 0 to 1
  emotion: number; // 0 to 1
  influence: number; // 0 to 1, how much this agent affects others
}

export interface SimulationConfig {
  mode: "geopolitics" | "crypto";
  numAgents: number;
  steps: number;
  randomSeed: number;
  scenarioLabel?: string;
}

export interface SimulationStepData {
  step: number;
  beliefs: Record<string, { bins: number[]; mean: number }>;
  polarization: Record<string, number>;
  events: string[];
}

export interface SimulationResult {
  finalBeliefs: Record<string, { bins: number[]; mean: number }>; // issueId -> histogram
  polarization: Record<string, number>; // issueId -> score
  timeline: { step: number; event: string }[];
  history?: SimulationStepData[];
}
