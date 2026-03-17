"use client";

import React, { useState, useEffect } from "react";
import { Upload, Play, Pause, SkipBack, SkipForward, FileText, Activity, AlertTriangle, Users } from "lucide-react";
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer } from "recharts";
import { WorldState, SimulationResult } from "@/lib/world";

export default function Home() {
  const [mode, setMode] = useState<"geopolitics" | "crypto">("geopolitics");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [worldState, setWorldState] = useState<WorldState | null>(null);

  const [numAgents, setNumAgents] = useState(100);
  const [steps, setSteps] = useState(10);
  const [randomSeed, setRandomSeed] = useState(42);
  const [deltaText, setDeltaText] = useState("");

  const [simulating, setSimulating] = useState(false);
  const [simResult, setSimResult] = useState<SimulationResult | null>(null);
  const [updatedWorld, setUpdatedWorld] = useState<WorldState | null>(null);

  const [reporting, setReporting] = useState(false);
  const [report, setReport] = useState<string | null>(null);

  // Playback state
  const [playbackStepIndex, setPlaybackStepIndex] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isPlaying && simResult?.history) {
      interval = setInterval(() => {
        setPlaybackStepIndex(prev => {
          if (prev >= (simResult.history?.length || 1) - 1) {
            setIsPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, 500); // 500ms per simulation step tick
    }
    return () => clearInterval(interval);
  }, [isPlaying, simResult]);

  const handleBtcIngest = async () => {
    setUploading(true);
    try {
      const res = await fetch("/api/btc-ingest", { method: "POST" });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      setDocumentId(data.documentId);
      setWorldState(data.worldState);
      setUpdatedWorld(data.worldState);
      setSimResult(null);
      setReport(null);
      setIsPlaying(false);
    } catch (err: unknown) {
      alert("BTC Ingest failed: " + (err as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      setDocumentId(data.documentId);
      setWorldState(data.worldState);
      setUpdatedWorld(data.worldState); // initial updated world is same
      setSimResult(null);
      setReport(null);
      setIsPlaying(false);
    } catch (err: unknown) {
      alert("Upload failed: " + (err as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const handleSimulate = async () => {
    if (!documentId) return;
    setSimulating(true);

    try {
      const res = await fetch("/api/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentId,
          config: { mode, numAgents, steps, randomSeed },
          deltaText
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      setSimResult(data.simulationResult);
      setUpdatedWorld(data.updatedWorld);
      
      // Auto-play the visualization
      setPlaybackStepIndex(0);
      setIsPlaying(true);
    } catch (err: unknown) {
      alert("Simulation failed: " + (err as Error).message);
    } finally {
      setSimulating(false);
    }
  };

  const handleReport = async () => {
    if (!simResult || !updatedWorld) return;
    setReporting(true);

    try {
      const res = await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          simulationResult: simResult,
          worldState: updatedWorld,
          mode,
          question: mode === "crypto" ? "Generate a summary report of this market scenario's outcome, predicting likely price action based on agent behavior." : "Generate a summary report of this scenario's outcome."
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      setReport(data.report);
    } catch (err: unknown) {
      alert("Report generation failed: " + (err as Error).message);
    } finally {
      setReporting(false);
    }
  };

  const currentStepData = simResult?.history?.[playbackStepIndex];
  const activeTimeline = simResult?.timeline.filter(t => t.step <= (currentStepData?.step || 0)) || [];

  return (
    <div className="min-h-screen bg-neutral-900 text-neutral-100 p-8 font-sans">
      <div className="max-w-5xl mx-auto space-y-8">
        
        <header className="flex flex-col md:flex-row items-start md:items-center justify-between pb-6 border-b border-neutral-800 gap-4">
          <div className="flex items-center space-x-3">
            <Activity className="w-8 h-8 text-blue-500" />
            <h1 className="text-3xl font-bold tracking-tight text-white">MicroFish</h1>
            <span className="text-neutral-400">| Scenario Simulator</span>
          </div>
          <div className="flex bg-neutral-900 border border-neutral-700 rounded-lg p-1">
            <button 
              onClick={() => { setMode("geopolitics"); setWorldState(null); setSimResult(null); }}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition ${mode === "geopolitics" ? "bg-neutral-700 text-white" : "text-neutral-400 hover:text-white"}`}
            >
              Geopolitics
            </button>
            <button 
              onClick={() => { setMode("crypto"); setWorldState(null); setSimResult(null); }}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition ${mode === "crypto" ? "bg-neutral-700 text-white" : "text-neutral-400 hover:text-white"}`}
            >
              Crypto Markets
            </button>
          </div>
        </header>

        {/* Upload Section */}
        <section className="bg-neutral-800 rounded-xl p-6 border border-neutral-700">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <Upload className="w-5 h-5" /> 1. Ingest Scenario
          </h2>
          
          {mode === "geopolitics" ? (
            <form onSubmit={handleUpload} className="flex gap-4 items-center">
              <input
                type="file"
                accept="application/pdf"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="block w-full text-sm text-neutral-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700 cursor-pointer"
              />
              <button
                type="submit"
                disabled={!file || uploading}
                className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-6 py-2 rounded-full font-medium transition shrink-0"
              >
                {uploading ? "Extracting..." : "Upload & Parse PDF"}
              </button>
            </form>
          ) : (
            <div className="flex items-center gap-4">
              <p className="text-sm text-neutral-400 flex-1">
                Fetch live, historical daily Bitcoin price data from Binance (last 30 days) to construct a localized crypto market simulation environment. No API key required.
              </p>
              <button
                onClick={handleBtcIngest}
                disabled={uploading}
                className="bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white px-6 py-2 rounded-full font-medium transition shrink-0"
              >
                {uploading ? "Fetching..." : "Ingest Live BTC Data"}
              </button>
            </div>
          )}
        </section>

        {/* Extracted World State */}
        {worldState && (
          <section className="bg-neutral-800 rounded-xl p-6 border border-neutral-700">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <Users className="w-5 h-5" /> 2. Extracted World State
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h3 className="text-sm uppercase tracking-wider text-neutral-400 font-semibold mb-2">Entities ({(worldState.entities || []).length})</h3>
                <div className="bg-neutral-900 rounded p-4 h-48 overflow-y-auto border border-neutral-700 text-sm">
                  {(worldState.entities || []).map((e, i) => (
                    <div key={i} className="mb-2">
                      <span className="font-semibold text-blue-400">{e.name}</span> <span className="text-neutral-500 text-xs">({e.type})</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h3 className="text-sm uppercase tracking-wider text-neutral-400 font-semibold mb-2">Issues & Risks</h3>
                <div className="bg-neutral-900 rounded p-4 h-48 overflow-y-auto border border-neutral-700 text-sm space-y-3">
                  {(worldState.issues || []).map((iss, i) => (
                    <div key={i} className="border-l-2 border-orange-500 pl-2">
                      <div className="font-semibold text-orange-400">{iss.topic}</div>
                      <div className="text-neutral-400 text-xs">{iss.tension}</div>
                    </div>
                  ))}
                  {(worldState.risks || []).map((r, i) => (
                    <div key={i} className="border-l-2 border-red-500 pl-2">
                      <div className="font-semibold text-red-400">Risk Severity: {r.severity}/5</div>
                      <div className="text-neutral-400 text-xs">{r.description}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Simulation Config */}
        {worldState && (
          <section className="bg-neutral-800 rounded-xl p-6 border border-neutral-700">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <Play className="w-5 h-5" /> 3. Run Simulation
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
              <div>
                <label className="block text-sm text-neutral-400 mb-1">Number of Agents</label>
                <input type="number" value={numAgents} onChange={e => setNumAgents(parseInt(e.target.value))} className="w-full bg-neutral-900 border border-neutral-700 rounded px-3 py-2 text-white" />
              </div>
              <div>
                <label className="block text-sm text-neutral-400 mb-1">Simulation Steps</label>
                <input type="number" value={steps} onChange={e => setSteps(parseInt(e.target.value))} className="w-full bg-neutral-900 border border-neutral-700 rounded px-3 py-2 text-white" />
              </div>
              <div>
                <label className="block text-sm text-neutral-400 mb-1">Random Seed</label>
                <input type="number" value={randomSeed} onChange={e => setRandomSeed(parseInt(e.target.value))} className="w-full bg-neutral-900 border border-neutral-700 rounded px-3 py-2 text-white" />
              </div>
            </div>
            
            <div className="mb-6">
              <label className="block text-sm text-neutral-400 mb-1">Scenario Update / Inject (Optional Delta)</label>
              <textarea 
                value={deltaText} 
                onChange={e => setDeltaText(e.target.value)} 
                placeholder="E.g. The central bank suddenly raises interest rates by 200 basis points..."
                className="w-full bg-neutral-900 border border-neutral-700 rounded px-3 py-2 text-white h-24"
              />
            </div>

            <button
              onClick={handleSimulate}
              disabled={simulating}
              className="bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white px-6 py-2 rounded-full font-medium transition flex items-center gap-2"
            >
              {simulating ? "Simulating..." : "Launch Agents"} <Play className="w-4 h-4" />
            </button>
          </section>
        )}

        {/* Results */}
        {simResult && updatedWorld && (
          <section className="bg-neutral-800 rounded-xl p-6 border border-neutral-700 transition-all">
            <div className="flex items-center justify-between mb-6 border-b border-neutral-700 pb-4">
              <h2 className="text-xl font-semibold flex items-center gap-2">
                <Activity className="w-5 h-5" /> 4. Simulation Visualization
              </h2>
              {simResult.history && (
                <div className="flex items-center gap-4 bg-neutral-900 rounded-full px-4 py-2 border border-neutral-700">
                  <button onClick={() => setPlaybackStepIndex(0)} disabled={playbackStepIndex === 0} title="Start">
                    <SkipBack className="w-4 h-4 text-neutral-400 hover:text-white" />
                  </button>
                  <button onClick={() => setIsPlaying(!isPlaying)}>
                    {isPlaying ? <Pause className="w-5 h-5 text-blue-400" /> : <Play className="w-5 h-5 text-blue-400" />}
                  </button>
                  <span className="text-sm font-mono text-neutral-300 w-24 text-center">
                    Step {currentStepData?.step || 0} / {steps}
                  </span>
                  <button onClick={() => setPlaybackStepIndex(simResult.history!.length - 1)} disabled={playbackStepIndex === simResult.history!.length - 1} title="End">
                    <SkipForward className="w-4 h-4 text-neutral-400 hover:text-white" />
                  </button>
                </div>
              )}
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
              {/* Charts */}
              <div className="space-y-6">
                <h3 className="text-sm uppercase tracking-wider text-neutral-400 font-semibold">Issue Polarization</h3>
                {(updatedWorld.issues || []).map(iss => {
                  const activeBeliefs = currentStepData ? currentStepData.beliefs[iss.id] : simResult.finalBeliefs[iss.id];
                  if (!activeBeliefs) return null;
                  
                  const chartData = activeBeliefs.bins.map((count, idx) => ({
                    name: (-1 + idx * 0.2 + 0.1).toFixed(1), // approx center of bin
                    count
                  }));
                  
                  const activePolarization = currentStepData ? currentStepData.polarization[iss.id] : simResult.polarization[iss.id];
                  const polScore = activePolarization?.toFixed(2) || "0.00";
                  
                  return (
                    <div key={iss.id} className="bg-neutral-900 p-4 rounded border border-neutral-700 transition-all duration-300">
                      <div className="flex justify-between mb-2 text-sm">
                        <span className="font-semibold text-white truncate max-w-[200px]" title={iss.topic}>{iss.topic}</span>
                        <span className="text-neutral-400 flex items-center gap-1">
                          Pol: <span className={Number(polScore) > 0.5 ? "text-red-400" : "text-green-400"}>{polScore}</span>
                        </span>
                      </div>
                      <div className="h-32">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={chartData}>
                            <XAxis dataKey="name" stroke="#525252" fontSize={10} tickFormatter={v => v.toString()} />
                            <Tooltip cursor={{fill: '#3f3f46'}} contentStyle={{backgroundColor: '#171717', border: '1px solid #404040', fontSize: '12px'}} />
                            <Bar dataKey="count" fill="#3b82f6" radius={[2, 2, 0, 0]} isAnimationActive={false} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="flex justify-between text-xs text-neutral-500 mt-1">
                        <span>Anti</span>
                        <span>Pro</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Timeline */}
              <div>
                <h3 className="text-sm uppercase tracking-wider text-neutral-400 font-semibold mb-4">Event Timeline Log</h3>
                <div className="bg-neutral-900 rounded p-4 border border-neutral-700 space-y-4 min-h-[16rem]">
                  {activeTimeline.length === 0 ? (
                    <div className="text-neutral-500 text-sm italic">Waiting for events...</div>
                  ) : (
                    activeTimeline.map((evt, i) => (
                      <div key={i} className="flex gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <div className="mt-0.5 text-blue-500"><AlertTriangle className="w-4 h-4" /></div>
                        <div>
                          <span className="text-xs text-blue-400 font-bold mr-2">Step {evt.step}</span>
                          <span className="text-sm text-neutral-200">{evt.event}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div className="mt-8">
                  <button
                    onClick={handleReport}
                    disabled={reporting || isPlaying}
                    className="w-full bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white px-6 py-3 rounded font-medium transition flex items-center justify-center gap-2"
                  >
                    {reporting ? "Analyzing..." : "Generate AI Analytic Report"} <FileText className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>

            {report && (
              <div className="mt-8 bg-neutral-900 p-6 rounded border border-neutral-700 prose prose-invert max-w-none">
                <h3 className="text-xl font-semibold mb-4 text-purple-400 border-b border-neutral-800 pb-2">Analytic Report</h3>
                <div className="text-neutral-300 text-sm leading-relaxed whitespace-pre-wrap">
                  {report}
                </div>
              </div>
            )}
            
          </section>
        )}

      </div>
    </div>
  );
}