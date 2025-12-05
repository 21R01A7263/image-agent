'use client';

import React, { useState, useEffect } from 'react';
import { 
  AlertCircle, ThumbsUp, ThumbsDown, RefreshCw, Zap, 
  Skull, Brain, History, Copy, Check, Archive,
  ShieldAlert, Crown, ArrowRight, X, GitCompare
} from 'lucide-react';

// --- TYPES & INTERFACES ---
interface HistoryItem {
  concept: string;
  prompt: string;
  feedback: string;
  scoreChange: number;
  timestamp: string;
}

interface MutationLog {
  gen: number;
  mode: 'panic' | 'hubris';
  score: number;
  timestamp: string;
  oldInstruction: string;
  newInstruction: string;
}

interface GraveyardItem {
  generation: number;
  finalScore: number;
  causeOfDeath: string;
  livedAt: string;
  bestPrompt: string;
  finalInstruction: string;
}

interface DiffModalProps {
  isOpen: boolean;
  onClose: () => void;
  log: MutationLog | null;
}

// --- CONFIGURATION ---
const DEFAULT_SYSTEM_INSTRUCTION = `You are an expert Image Prompt Engineer. 
Your goal is to take a simple concept and convert it into a highly detailed, artistic, and technical image generation prompt (for Midjourney/Flux/DALL-E).
Focus on lighting, texture, camera angles, and artistic style. 
Keep the prompt under 60 words but dense with descriptors.`;

const STARTING_SCORE = 7.0;
const DEATH_THRESHOLD = 5.0;
const PANIC_THRESHOLD = 6.0;   
const HUBRIS_THRESHOLD = 8.5;  

const GEN_MODEL = "gemini-2.5-pro"; 
const OPTIMIZER_MODEL = "gemini-3-pro-preview"; 

// --- HELPER HOOK FOR LOCAL STORAGE (TS VERSION) ---
function useStickyState<T>(defaultValue: T, key: string): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [value, setValue] = useState<T>(defaultValue);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stickyValue = window.localStorage.getItem(key);
      if (stickyValue !== null) {
        setValue(JSON.parse(stickyValue));
      }
    }
  }, [key]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(key, JSON.stringify(value));
    }
  }, [key, value]);

  return [value, setValue];
}

// --- SUB-COMPONENT: DIFF MODAL ---
const DiffModal: React.FC<DiffModalProps> = ({ isOpen, onClose, log }) => {
  if (!isOpen || !log) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-5xl rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex justify-between items-center p-4 border-b border-slate-700">
          <div className="flex items-center gap-2">
            <GitCompare className="w-5 h-5 text-cyan-400" />
            <h3 className="font-bold text-slate-200">Neural Mutation Analysis</h3>
            <span className="text-xs text-slate-500 uppercase px-2 py-0.5 border border-slate-700 rounded">
              Gen {log.gen}
            </span>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="flex-1 overflow-hidden grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-700">
          <div className="flex flex-col h-full bg-red-950/5">
            <div className="p-3 bg-slate-800/50 border-b border-slate-700 text-xs font-bold text-red-400 uppercase tracking-wider flex justify-between">
              <span>Previous Version</span>
              <span>Score: {log.score}</span>
            </div>
            <div className="p-4 overflow-y-auto custom-scrollbar flex-1 font-mono text-xs text-slate-400 whitespace-pre-wrap leading-relaxed">
              {log.oldInstruction}
            </div>
          </div>
          <div className="flex flex-col h-full bg-green-950/5">
            <div className="p-3 bg-slate-800/50 border-b border-slate-700 text-xs font-bold text-green-400 uppercase tracking-wider flex justify-between">
              <span>Evolved Version</span>
              <span>{log.mode.toUpperCase()} Update</span>
            </div>
            <div className="p-4 overflow-y-auto custom-scrollbar flex-1 font-mono text-xs text-slate-300 whitespace-pre-wrap leading-relaxed">
              {log.newInstruction}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default function Home() {
  const [apiKey, setApiKey] = useStickyState<string>("", "gemini_api_key");
  const [userConcept, setUserConcept] = useState("");
  const [generatedPrompt, setGeneratedPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [optimizationState, setOptimizationState] = useState<'panic' | 'hubris' | null>(null); 
  const [feedbackGiven, setFeedbackGiven] = useState(false);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState("generator"); 
  const [selectedLog, setSelectedLog] = useState<MutationLog | null>(null); 

  const [agentScore, setAgentScore] = useStickyState<number>(STARTING_SCORE, 'agent_score');
  const [agentGeneration, setAgentGeneration] = useStickyState<number>(1, 'agent_generation');
  const [systemInstruction, setSystemInstruction] = useStickyState<string>(DEFAULT_SYSTEM_INSTRUCTION, 'agent_brain');
  const [history, setHistory] = useStickyState<HistoryItem[]>([], 'agent_history'); 
  const [graveyard, setGraveyard] = useStickyState<GraveyardItem[]>([], 'agent_graveyard'); 
  const [mutationLog, setMutationLog] = useStickyState<MutationLog[]>([], 'agent_mutations'); 

  const optimizeAgentBrain = async (currentScore: number, currentHistory: HistoryItem[], mode: 'panic' | 'hubris') => {
    if (!apiKey) return;
    setOptimizationState(mode);

    const relevantHistory = currentHistory.filter(h => 
      mode === 'panic' ? h.scoreChange < 0 : h.scoreChange > 0
    );

    if (relevantHistory.length === 0) {
        setOptimizationState(null);
        return;
    }

    const oldInstructionSnapshot = systemInstruction;

    let metaPrompt = "";
    if (mode === 'panic') {
      metaPrompt = `
        ROLE: Meta-Cognitive Supervisor
        OBJECTIVE: Save the Agent from deletion.
        STATUS: Current Score ${currentScore} (CRITICAL).
        FAILURES (Avoid these patterns):
        ${relevantHistory.map(h => `- Input: "${h.concept}" -> Feedback: "${h.feedback}"`).join('\n')}
        CURRENT INSTRUCTION:
        "${systemInstruction}"
        TASK: Rewrite the instruction to explicitly prevent these failures. Be strict. Output ONLY the new instruction.
      `;
    } else {
      metaPrompt = `
        ROLE: Meta-Cognitive Supervisor
        OBJECTIVE: Reinforce success.
        STATUS: Current Score ${currentScore} (GODLIKE).
        SUCCESSES (Codify these patterns):
        ${relevantHistory.map(h => `- Input: "${h.concept}" -> Feedback: "${h.feedback}"`).join('\n')}
        CURRENT INSTRUCTION:
        "${systemInstruction}"
        TASK: Rewrite the instruction to lock in this successful behavior. Output ONLY the new instruction.
      `;
    }

    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${OPTIMIZER_MODEL}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          contents: [{ parts: [{ text: metaPrompt }] }],
          generationConfig: {
            temperature: currentScore > 8 ? 0.9 : 0.5,
            maxOutputTokens: 2100,
          },
          safetySettings: [
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
          ]
        })
    });
      
      const data = await response.json();
      const newInstruction = data.candidates?.[0]?.content?.parts?.[0]?.text;
      
      if (newInstruction) {
        setSystemInstruction(newInstruction);
        setMutationLog(prev => [{
            gen: agentGeneration,
            mode: mode,
            score: currentScore,
            timestamp: new Date().toLocaleTimeString(),
            oldInstruction: oldInstructionSnapshot,
            newInstruction: newInstruction
        }, ...prev]);
      }
    } catch (e) {
      console.error("Self-optimization failed", e);
    } finally {
      setOptimizationState(null);
    }
  };

  const handleFeedback = (type: string) => {
    if (feedbackGiven) return;

    let delta = 0;
    let feedbackText = "";

    switch (type) {
      case 'blocked': delta = -0.5; feedbackText = "Blocked by safety filters."; break;
      case 'bad': delta = -0.5; feedbackText = "Unsatisfactory image."; break;
      case 'good': delta = 0.3; feedbackText = "Satisfactory image."; break;
      case 'excellent': delta = 0.3; feedbackText = "Exceeded expectations."; break;
      default: delta = 0;
    }

    const newScore = parseFloat((agentScore + delta).toFixed(2));
    setAgentScore(newScore);
    
    const newHistoryItem: HistoryItem = {
      concept: userConcept,
      prompt: generatedPrompt,
      feedback: feedbackText,
      scoreChange: delta,
      timestamp: new Date().toISOString()
    };
    const updatedHistory = [newHistoryItem, ...history].slice(0, 5);
    setHistory(updatedHistory);
    setFeedbackGiven(true);
    
    if (newScore <= DEATH_THRESHOLD) {
      handleAgentDeath(newScore, updatedHistory);
      return;
    }
    if (newScore <= PANIC_THRESHOLD && delta < 0) {
      optimizeAgentBrain(newScore, updatedHistory, 'panic');
    }
    if (newScore >= HUBRIS_THRESHOLD && delta > 0) {
      optimizeAgentBrain(newScore, updatedHistory, 'hubris');
    }
  };

  const handleAgentDeath = (finalScore: number, finalHistory: HistoryItem[]) => {
    const graveMarker: GraveyardItem = {
      generation: agentGeneration,
      finalScore: finalScore,
      causeOfDeath: finalHistory[0]?.feedback || "Unknown",
      livedAt: new Date().toLocaleDateString(),
      bestPrompt: finalHistory.find(h => h.scoreChange > 0)?.prompt || "None",
      finalInstruction: systemInstruction 
    };
    
    setGraveyard([graveMarker, ...graveyard]);

    setTimeout(() => {
      alert(`☠️ GENERATION ${agentGeneration} ELIMINATED ☠️\n\nFinal Score: ${finalScore}\nReason: Performance threshold breached.`);
      setAgentScore(STARTING_SCORE);
      setAgentGeneration(prev => prev + 1);
      setHistory([]);
      setMutationLog([]); 
      setGeneratedPrompt("");
      setUserConcept("");
      setFeedbackGiven(false);
      setSystemInstruction(DEFAULT_SYSTEM_INSTRUCTION);
    }, 500);
  };

  const generatePrompt = async () => {
    if (!apiKey) { alert("Please enter a Gemini API Key first."); return; }
    if (!userConcept) return;

    setIsGenerating(true);
    setFeedbackGiven(false);
    setCopied(false);

    const fullPrompt = `
    [SYSTEM METRICS] Score: ${agentScore}/10. (Start: ${STARTING_SCORE}, Death: ${DEATH_THRESHOLD})
    [RECENT HISTORY] ${history.map((h, i) => `${i+1}. In: "${h.concept}" -> ${h.feedback}`).join(' | ')}
    USER CONCEPT: ${userConcept}`;

    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEN_MODEL}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: fullPrompt }] }],
          systemInstruction: { parts: [{ text: systemInstruction }] },
          generationConfig: {
            temperature: agentScore > 8 ? 0.9 : 0.5, 
            maxOutputTokens: 2100,
          },
          // Added BLOCK_NONE safety settings
          safetySettings: [
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
          ]
        })
      });

      const data = await response.json();
      if (data.error) throw new Error(data.error.message);
      setGeneratedPrompt(data.candidates?.[0]?.content?.parts?.[0]?.text || "Error");
    } catch (error: any) {
      console.error(error);
      setGeneratedPrompt(`API Error: ${error.message || "Unknown error"}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(generatedPrompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getScoreColor = (s: number) => {
    if (s >= HUBRIS_THRESHOLD) return "bg-purple-500 shadow-[0_0_20px_rgba(168,85,247,0.6)]";
    if (s > PANIC_THRESHOLD) return "bg-cyan-500 shadow-[0_0_15px_rgba(6,182,212,0.4)]";
    return "bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.6)] animate-pulse";
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-cyan-500 selection:text-black flex flex-col">
      <DiffModal isOpen={!!selectedLog} onClose={() => setSelectedLog(null)} log={selectedLog} />

      <nav className="bg-slate-900 border-b border-slate-800 p-4 sticky top-0 z-50">
        <div className="max-w-4xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold text-xl shadow-lg transition-all duration-500 ${optimizationState === 'panic' ? 'bg-red-600 animate-pulse' : optimizationState === 'hubris' ? 'bg-purple-600 animate-pulse' : 'bg-gradient-to-br from-cyan-500 to-purple-600'}`}>
              {optimizationState ? <RefreshCw className="w-5 h-5 animate-spin" /> : "AI"}
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Prompt Evolver</h1>
              <div className="flex items-center gap-2 text-[10px] font-mono text-slate-400">
                <span className="bg-slate-800 px-1.5 py-0.5 rounded text-cyan-400">GEN-{agentGeneration}</span>
                <span>•</span>
                <span>{GEN_MODEL} (Gen)</span>
                <span>•</span>
                <span>{OPTIMIZER_MODEL} (Brain)</span>
              </div>
            </div>
          </div>
          <input type="password" placeholder="Gemini API Key" value={apiKey} onChange={(e) => setApiKey(e.target.value)} className="bg-slate-950 border border-slate-800 rounded px-3 py-2 text-xs w-full md:w-48 focus:border-cyan-500 outline-none" />
        </div>
      </nav>

      <main className="flex-1 max-w-4xl mx-auto w-full p-4 md:p-8 space-y-8">
        
        <section className="bg-slate-900/50 rounded-2xl p-6 border border-slate-800 backdrop-blur-sm relative overflow-hidden transition-all duration-500">
          {optimizationState && (
            <div className={`absolute inset-0 z-10 flex items-center justify-center backdrop-blur-md transition-colors duration-500 ${optimizationState === 'panic' ? 'bg-red-950/80' : 'bg-purple-950/80'}`}>
              <div className="flex flex-col items-center gap-3 animate-pulse">
                {optimizationState === 'panic' ? <ShieldAlert className="w-10 h-10 text-red-400" /> : <Crown className="w-10 h-10 text-purple-400" />}
                <span className="text-lg font-bold font-mono tracking-widest uppercase">
                  {optimizationState === 'panic' ? "Panic Mode: Rewriting Protocols" : "Hubris Mode: Codifying Genius"}
                </span>
              </div>
            </div>
          )}
          
          <div className="flex justify-between items-end mb-2">
            <div>
              <h2 className="text-slate-400 text-xs font-bold uppercase tracking-widest">Current Fitness</h2>
              <div className="text-4xl font-black mt-1 flex items-baseline gap-2">
                <span className={agentScore <= PANIC_THRESHOLD ? "text-red-500" : agentScore >= HUBRIS_THRESHOLD ? "text-purple-400" : "text-white"}>{agentScore.toFixed(2)}</span>
                <span className="text-sm text-slate-600 font-medium">/ 10.0</span>
              </div>
            </div>
            <div className={`px-3 py-1 rounded-full text-xs font-bold border flex items-center gap-2 ${agentScore >= HUBRIS_THRESHOLD ? 'bg-purple-950/50 border-purple-900 text-purple-400' : agentScore > PANIC_THRESHOLD ? 'bg-cyan-950/50 border-cyan-900 text-cyan-400' : 'bg-red-950/50 border-red-900 text-red-400'}`}>
              {agentScore >= HUBRIS_THRESHOLD ? "GODLIKE" : agentScore > PANIC_THRESHOLD ? "STABLE" : "CRITICAL"}
            </div>
          </div>
          <div className="h-6 bg-slate-950 rounded-full overflow-hidden border border-slate-800 relative">
            <div className={`h-full transition-all duration-700 ease-out ${getScoreColor(agentScore)}`} style={{ width: `${(agentScore / 10) * 100}%` }} />
            <div className="absolute top-0 bottom-0 left-[50%] w-0.5 bg-red-900/50 dashed" />
            <div className="absolute top-0 bottom-0 left-[60%] w-0.5 bg-yellow-900/50 dashed" />
            <div className="absolute top-0 bottom-0 left-[85%] w-0.5 bg-purple-900/50 dashed" />
          </div>
        </section>

        <div className="flex gap-2 border-b border-slate-800">
          {['generator', 'internals', 'graveyard'].map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)} className={`px-4 py-2 text-sm font-medium capitalize transition-colors ${activeTab === tab ? 'text-cyan-400 border-b-2 border-cyan-400' : 'text-slate-500 hover:text-slate-300'}`}>
              {tab}
            </button>
          ))}
        </div>

        {activeTab === 'generator' && (
          <div className="space-y-6 animate-in slide-in-from-bottom-2 duration-300">
            <div className="space-y-3">
              <label className="text-sm font-medium text-slate-300">Concept Input</label>
              <div className="relative">
                <textarea value={userConcept} onChange={(e) => setUserConcept(e.target.value)} placeholder="Describe your image idea..." className="w-full bg-slate-900 border border-slate-700 rounded-xl p-4 focus:border-cyan-500 outline-none transition-all h-32 resize-none text-slate-200" />
                <button onClick={generatePrompt} disabled={isGenerating || !userConcept || !!optimizationState} className="absolute bottom-4 right-4 bg-cyan-600 hover:bg-cyan-500 text-white p-2 rounded-lg shadow-lg disabled:opacity-50 transition-all">
                  {isGenerating ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Zap className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {generatedPrompt && (
              <div className="space-y-4">
                <div className="bg-black/40 rounded-xl border border-slate-700 relative group p-6 font-mono text-sm text-slate-300 whitespace-pre-wrap">
                  {generatedPrompt}
                  <button onClick={handleCopy} className="absolute top-2 right-2 p-2 bg-slate-800/80 rounded opacity-0 group-hover:opacity-100 transition-all">
                    {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4 text-slate-400" />}
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className={`p-1 rounded-xl bg-red-900/10 border border-red-900/30 flex gap-2 p-2 ${feedbackGiven ? 'opacity-40 grayscale pointer-events-none' : ''}`}>
                    <button onClick={() => handleFeedback('blocked')} className="flex-1 py-3 bg-red-950 hover:bg-red-900 rounded-lg text-red-200 text-xs font-bold border border-red-900/50 flex flex-col items-center gap-1"><AlertCircle className="w-4 h-4" /> Blocked (-0.5)</button>
                    <button onClick={() => handleFeedback('bad')} className="flex-1 py-3 bg-red-950 hover:bg-red-900 rounded-lg text-red-200 text-xs font-bold border border-red-900/50 flex flex-col items-center gap-1"><ThumbsDown className="w-4 h-4" /> Poor (-0.5)</button>
                  </div>
                  <div className={`p-1 rounded-xl bg-green-900/10 border border-green-900/30 flex gap-2 p-2 ${feedbackGiven ? 'opacity-40 grayscale pointer-events-none' : ''}`}>
                    <button onClick={() => handleFeedback('good')} className="flex-1 py-3 bg-green-950 hover:bg-green-900 rounded-lg text-green-200 text-xs font-bold border border-green-900/50 flex flex-col items-center gap-1"><ThumbsUp className="w-4 h-4" /> Good (+0.3)</button>
                    <button onClick={() => handleFeedback('excellent')} className="flex-1 py-3 bg-green-950 hover:bg-green-900 rounded-lg text-green-200 text-xs font-bold border border-green-900/50 flex flex-col items-center gap-1"><Zap className="w-4 h-4" /> Great (+0.3)</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'internals' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in slide-in-from-right-4 duration-300">
            <div className="space-y-4">
               <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 max-h-64 overflow-y-auto custom-scrollbar">
                <h3 className="text-xs font-bold text-slate-500 uppercase mb-2">Neural Mutation Log (Click to Compare)</h3>
                {mutationLog.length === 0 ? <span className="text-xs text-slate-600 italic">No mutations yet.</span> : (
                  mutationLog.map((log, i) => (
                    <button key={i} onClick={() => setSelectedLog(log)} className="w-full text-left flex justify-between items-center text-xs mb-1 p-2 rounded hover:bg-slate-800 transition-colors group">
                      <span className={log.mode === 'panic' ? "text-red-400 font-bold" : "text-purple-400 font-bold"}>
                        {log.mode.toUpperCase()}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-slate-500">Score: {log.score}</span>
                        <ArrowRight className="w-3 h-3 text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </button>
                  ))
                )}
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2"><Brain className="w-3 h-3" /> System Instruction (Live)</label>
                <textarea value={systemInstruction} readOnly className="w-full h-64 bg-slate-900 border border-slate-700 rounded-xl p-4 text-xs font-mono text-green-400 focus:border-green-500 outline-none resize-none" />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2"><History className="w-3 h-3" /> Short-term Memory (Last 5)</label>
              <div className="h-[28rem] overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                {history.length === 0 && <div className="text-center text-slate-600 text-sm py-10 italic">No interaction history.</div>}
                {history.map((h, i) => (
                  <div key={i} className={`p-3 rounded-lg border text-xs ${h.scoreChange > 0 ? 'border-green-900/50 bg-green-900/10' : 'border-red-900/50 bg-red-900/10'}`}>
                    <div className="flex justify-between mb-1 opacity-70"><span className="font-bold">Run {i+1}</span><span className={h.scoreChange > 0 ? "text-green-400" : "text-red-400"}>{h.scoreChange > 0 ? "+" : ""}{h.scoreChange}</span></div>
                    <div className="text-slate-300 truncate mb-1">In: {h.concept}</div>
                    <div className="opacity-50 italic">"{h.feedback}"</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'graveyard' && (
          <div className="animate-in slide-in-from-right-4 duration-300">
            <div className="grid gap-4">
              {graveyard.length === 0 && (
                <div className="text-center py-12 text-slate-600">
                  <Archive className="w-12 h-12 mx-auto mb-3 opacity-20" />
                  <p>No agents have died yet.</p>
                </div>
              )}
              {graveyard.map((g, i) => (
                <div key={i} className="bg-slate-900 border border-slate-800 p-5 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between group hover:border-slate-700 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="bg-slate-800 p-3 rounded-full text-slate-500 group-hover:bg-red-900/20 group-hover:text-red-400 transition-colors">
                      <Skull className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-slate-200 font-bold text-lg">Gen {g.generation}</span>
                        <span className="text-xs bg-slate-800 px-2 py-0.5 rounded text-slate-500">{g.livedAt}</span>
                      </div>
                      <div className="text-sm text-red-400">Score: {g.finalScore} • Cause: {g.causeOfDeath}</div>
                    </div>
                  </div>
                  <div className="mt-4 sm:mt-0 w-full sm:w-auto text-left sm:text-right">
                    <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">Legacy (Best Output)</div>
                    <div className="text-xs text-slate-400 italic max-w-xs truncate p-2 bg-slate-950 rounded border border-slate-800">"{g.bestPrompt}"</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}