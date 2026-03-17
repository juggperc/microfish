import { Agent, AgentGroup, SimulationConfig, SimulationResult, SimulationStepData, WorldState } from "./world";

// Simple LCG for deterministic randomness
function createSeededRandom(seed: number) {
  let value = seed;
  return function random() {
    value = (value * 9301 + 49297) % 233280;
    return value / 233280;
  };
}

const INFLUENCE_MAP: Record<AgentGroup, number> = {
  whale: 0.9,
  media: 0.8,
  government: 0.8,
  institution: 0.7,
  military: 0.6,
  business: 0.6,
  miner: 0.5,
  bot: 0.4,
  ngo: 0.4,
  public: 0.1,
  retail: 0.1
};

export function generateAgents(world: WorldState, config: SimulationConfig): Agent[] {
  const rng = createSeededRandom(config.randomSeed);
  
  const groups: AgentGroup[] = config.mode === "crypto" 
    ? ["whale", "retail", "retail", "retail", "miner", "institution", "bot", "media"]
    : ["government", "public", "public", "public", "military", "business", "ngo", "media"];
  
  const agents: Agent[] = [];
  
  // Base issues and sentiments derived from claims
  const issueSentiments: Record<string, number> = {};
  (world.claims || []).forEach(c => {
    const matchedIssue = (world.issues || []).find(i => c.object?.toLowerCase().includes(i.topic?.toLowerCase() || "") || i.topic?.toLowerCase().includes(c.object?.toLowerCase() || ""));
    if (matchedIssue) {
      if (!issueSentiments[matchedIssue.id]) issueSentiments[matchedIssue.id] = 0;
      issueSentiments[matchedIssue.id] += c.stance * (1 - c.uncertainty);
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
      // Retail/Public more volatile, Institutions/Government more stable
      const volatility = (group === "retail" || group === "public") ? 0.8 : 0.3;
      beliefs[issue.id] = Math.max(-1, Math.min(1, base + (rng() * 2 - 1) * volatility));
    });

    const trust: Record<string, number> = {};
    groups.forEach(g => {
      // Echo chamber tendency: high trust in own group, lower elsewhere. Retail trusts whales somewhat but not always.
      if (g === group) trust[g] = 0.8 + rng() * 0.2;
      else if (group === "retail" && g === "whale") trust[g] = 0.6 + rng() * 0.4;
      else if (group === "public" && g === "media") trust[g] = 0.5 + rng() * 0.4;
      else trust[g] = rng() * 0.5; // low baseline trust
    });

    // Influence assignment + random noise to make some retail influencers, etc.
    const baseInfluence = INFLUENCE_MAP[group];
    const influence = Math.max(0, Math.min(1, baseInfluence + (rng() * 0.2 - 0.1)));

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
      confidence: 0.4 + rng() * 0.6,
      trust,
      emotion: riskFactor * rng(), // Emotion influenced by world risk
      influence
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
    let shockOccurred = false;
    let shockEvent = "";
    
    // Introduce random external shock (like MiroFish "news breaks")
    if (rng() > 0.85) {
      shockOccurred = true;
      const shockImpact = (rng() * 0.4) - 0.2; // -0.2 to 0.2
      const targetIssue = (world.issues || [])[Math.floor(rng() * (world.issues || []).length)];
      if (targetIssue) {
         shockEvent = `Random Shock: Sudden news impacted sentiment on '${targetIssue.topic}' by ${shockImpact > 0 ? '+' : ''}${(shockImpact*100).toFixed(0)}%`;
         nextAgents.forEach(a => {
             // Emotion makes them more susceptible
             a.beliefs[targetIssue.id] = Math.max(-1, Math.min(1, a.beliefs[targetIssue.id] + (shockImpact * a.emotion)));
         });
      }
    }

    // At each tick, agent interacts
    for (let i = 0; i < nextAgents.length; i++) {
      const a = nextAgents[i];
      
      // Select partner using preferential attachment (more likely to interact with highly influential agents)
      let bIndex = Math.floor(rng() * nextAgents.length);
      for(let retry=0; retry<3; retry++){
          if(nextAgents[bIndex].influence > rng()) break;
          bIndex = Math.floor(rng() * nextAgents.length);
      }
      
      const b = nextAgents[bIndex];
      if (a.id === b.id) continue;
      
      const trustAB = a.trust[b.group] || 0.1;
      
      (world.issues || []).forEach(issue => {
        const beliefA = a.beliefs[issue.id];
        const beliefB = b.beliefs[issue.id];
        const diff = Math.abs(beliefA - beliefB);
        
        maxDisagreement = Math.max(maxDisagreement, diff);
        
        // MiroFish Bounded Confidence + Influence
        // A updates belief towards B only if difference is within confidence bound, OR B is highly influential/trusted
        if (diff < a.confidence || trustAB > 0.6 || b.influence > 0.8) {
          // move belief towards B proportional to trust, B's influence, and B's confidence
          const shift = (beliefB - beliefA) * trustAB * b.influence * b.confidence * 0.2;
          a.beliefs[issue.id] = Math.max(-1, Math.min(1, beliefA + shift));
          
          // A's confidence might increase if B agrees, or decrease if forced to shift a lot
          if (diff < 0.2) a.confidence = Math.min(1, a.confidence + 0.01);
          else a.confidence = Math.max(0, a.confidence - 0.05);
          
        } else if (trustAB < 0.3 && diff > 1.0) {
          // Polarization / Echo chamber reaction: move away
          const shift = (beliefA > 0 ? 0.1 : -0.1) * (1 - trustAB) * a.emotion;
          a.beliefs[issue.id] = Math.max(-1, Math.min(1, beliefA + shift));
          // Increase emotion when arguing
          a.emotion = Math.min(1, a.emotion + 0.05);
        }
      });
      
      // Decay emotion back to baseline slowly
      a.emotion = Math.max(0, a.emotion - 0.01);
    }
    
    currentAgents = nextAgents;
    
    // Record timeline events heuristically
    const stepEvents: string[] = [];
    if (shockOccurred) {
        stepEvents.push(shockEvent);
        timeline.push({ step, event: shockEvent });
    }
    
    if (step === Math.floor(config.steps / 2) && maxDisagreement > 1.5) {
      const msg = "A major polarization rift appeared mid-simulation between factions.";
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