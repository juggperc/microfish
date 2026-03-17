import { Agent, AgentGroup, SimulationConfig, SimulationResult, SimulationStepData, WorldState } from "./world";

// Simple LCG for deterministic randomness
function createSeededRandom(seed: number) {
  let value = seed;
  return function random() {
    value = (value * 9301 + 49297) % 233280;
    return value / 233280;
  };
}

export function generateAgents(world: WorldState, config: SimulationConfig): Agent[] {
  const rng = createSeededRandom(config.randomSeed);
  const groups: AgentGroup[] = ["government", "public", "military", "business", "ngo", "media"];
  
  const agents: Agent[] = [];
  
  // Base issues and sentiments derived from claims
  const issueSentiments: Record<string, number> = {};
  (world.claims || []).forEach(c => {
    // roughly associate claim object with issue if mentioned
    const matchedIssue = (world.issues || []).find(i => c.object?.toLowerCase().includes(i.topic?.toLowerCase() || "") || i.topic?.toLowerCase().includes(c.object?.toLowerCase() || ""));
    if (matchedIssue) {
      if (!issueSentiments[matchedIssue.id]) issueSentiments[matchedIssue.id] = 0;
      issueSentiments[matchedIssue.id] += c.stance * (1 - c.uncertainty); // Higher certainty = stronger weight
    }
  });

  const riskFactor = (world.risks || []).reduce((acc, r) => acc + (r.severity || 1), 0) / ((world.risks || []).length || 1) / 5; // 0 to 1
  
  for (let i = 0; i < config.numAgents; i++) {
    const group = groups[Math.floor(rng() * groups.length)];
    
    // Initial beliefs
    const beliefs: Record<string, number> = {};
    (world.issues || []).forEach(issue => {
      // Base belief around the world sentiment + random noise
      const base = issueSentiments[issue.id] || 0;
      beliefs[issue.id] = Math.max(-1, Math.min(1, base + (rng() * 2 - 1) * 0.5));
    });

    const trust: Record<string, number> = {};
    groups.forEach(g => {
      trust[g] = g === group ? 0.8 + rng()*0.2 : rng(); // High trust in own group, random in others
    });

    agents.push({
      id: `agent-${i}`,
      group,
      ideology: {
        statusQuo: rng(),
        change: rng(),
        hawkish: rng(),
        dovish: rng()
      },
      beliefs,
      confidence: 0.5 + rng() * 0.5,
      trust,
      emotion: riskFactor * rng() // Emotion influenced by world risk
    });
  }
  
  return agents;
}

function calculateMetrics(currentAgents: Agent[], world: WorldState) {
  const beliefs: Record<string, { bins: number[], mean: number }> = {};
  const polarization: Record<string, number> = {};
  
  (world.issues || []).forEach(issue => {
    let sum = 0;
    const bins = new Array(10).fill(0); // -1 to 1 in 10 bins
    
    currentAgents.forEach(a => {
      const b = a.beliefs[issue.id];
      sum += b;
      const binIdx = Math.min(9, Math.max(0, Math.floor((b + 1) / 2 * 9.99)));
      bins[binIdx]++;
    });
    
    const mean = sum / currentAgents.length;
    beliefs[issue.id] = { bins, mean };
    
    // Polarization: roughly standard deviation or bimodality
    let variance = 0;
    currentAgents.forEach(a => {
      variance += Math.pow(a.beliefs[issue.id] - mean, 2);
    });
    variance /= currentAgents.length;
    polarization[issue.id] = variance; // Higher variance = higher polarization
  });
  
  return { beliefs, polarization };
}

export function runSimulation(world: WorldState, config: SimulationConfig, agents: Agent[]): SimulationResult {
  const rng = createSeededRandom(config.randomSeed);
  const timeline: { step: number; event: string }[] = [];
  const history: SimulationStepData[] = [];
  
  // Clone agents for simulation
  let currentAgents = JSON.parse(JSON.stringify(agents)) as Agent[];
  
  // Initial state logging
  const initialMetrics = calculateMetrics(currentAgents, world);
  history.push({
    step: 0,
    beliefs: initialMetrics.beliefs,
    polarization: initialMetrics.polarization,
    events: []
  });

  for (let step = 1; step <= config.steps; step++) {
    const nextAgents = JSON.parse(JSON.stringify(currentAgents)) as Agent[];
    let maxDisagreement = 0;
    
    // At each tick, pair agents randomly
    for (let i = 0; i < nextAgents.length; i++) {
      const a = nextAgents[i];
      // Random partner
      const bIndex = Math.floor(rng() * nextAgents.length);
      const b = nextAgents[bIndex];
      
      if (a.id === b.id) continue;
      
      // Update beliefs
      const trustAB = a.trust[b.group] || 0.1;
      
      (world.issues || []).forEach(issue => {
        const beliefA = a.beliefs[issue.id];
        const beliefB = b.beliefs[issue.id];
        const diff = Math.abs(beliefA - beliefB);
        
        maxDisagreement = Math.max(maxDisagreement, diff);
        
        // DeGroot-style update if trust is high enough or difference is small
        if (trustAB > 0.3 || diff < 0.5) {
          // move belief towards B proportional to trust and B's confidence
          const shift = (beliefB - beliefA) * trustAB * b.confidence * 0.1;
          a.beliefs[issue.id] = Math.max(-1, Math.min(1, beliefA + shift));
        } else if (trustAB < 0.2 && diff > 1.0) {
          // Polarization: move away
          const shift = (beliefA > 0 ? 0.1 : -0.1) * (1 - trustAB);
          a.beliefs[issue.id] = Math.max(-1, Math.min(1, beliefA + shift));
        }
      });
      
      // Update emotion based on disagreement
      a.emotion = Math.max(0, Math.min(1, a.emotion + (maxDisagreement * 0.05) - 0.01));
    }
    
    currentAgents = nextAgents;
    
    // Record timeline events heuristically
    const stepEvents: string[] = [];
    if (step === Math.floor(config.steps / 2) && maxDisagreement > 1.5) {
      const msg = "A major polarization rift appeared mid-simulation.";
      timeline.push({ step, event: msg });
      stepEvents.push(msg);
    }
    if (step === config.steps) {
      const msg = maxDisagreement < 0.5 ? "Consensus largely achieved by end of simulation." : "Significant unresolved tensions persist.";
      timeline.push({ step, event: msg });
      stepEvents.push(msg);
    }

    const metrics = calculateMetrics(currentAgents, world);
    history.push({
      step,
      beliefs: metrics.beliefs,
      polarization: metrics.polarization,
      events: stepEvents
    });
  }

  const finalMetrics = calculateMetrics(currentAgents, world);

  return { 
    finalBeliefs: finalMetrics.beliefs, 
    polarization: finalMetrics.polarization, 
    timeline,
    history
  };
}