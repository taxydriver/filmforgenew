import { useState, useEffect, useRef } from 'react';
import { Sparkles, Play, CornerDownLeft } from 'lucide-react';
import { Badge } from './components/ui/badge';
import { WorkflowSteps } from './components/WorkflowSteps';
import { IdeaStep } from './components/IdeaStep';
import { ConceptStep } from './components/ConceptStep';
import { ScreenplayStep } from './components/ScreenplayStep';
import { TrailerStep } from './components/TrailerStep';
import StoryboardCharactersStep, { StoryboardCharactersPayload } from './components/StoryboardCharactersStep';
import type { ModelProvider } from '@/types/model';
import { FilmforgeChatProvider } from '@/lib/chatContext';
import GlobalChatDock from '@/components/GlobalChatDock';
import GlobalChatSidebar from '@/components/GlobalChatSidebar';
import { useScreenplayStore } from "@/lib/screenplayStore";

import {
  generateConceptStep,
  generateScreenplayStep,
  generateTrailerStep,
} from "@/lib/autoforge";

export type Step = 'idea' | 'concept' | 'screenplay' | 'storychars' | 'trailer';

export interface ProjectData {
  idea: string;
  concept: string;
  screenplay: string;
  storychars: StoryboardCharactersPayload | null;
  trailer: {
    videoUrl: string;
    description: string;
  } 
  
  | null;

  // NEW: persist trailer artifacts across navigation
  trailerArtifacts?: {
    storyboardShots: Array<{ id?: number; prompt: string; negative?: string }>;
    stills: Array<{ url: string; prompt?: string; rawUrl?: string; filename?: string }>;
    clips: Array<{ url: string; filename?: string; i: number }>;
    startedPrefixes?: string[];
  };
}

// shared types for options that live under the Idea box
export type Scope = 'storyboard' | 'trailer' | 'short_film' | 'feature_film';
export type WriterMode = 'single_writer' | 'multiple_writers';
export type { ModelProvider } from '@/types/model';

export default function App() {
  const [currentStep, setCurrentStep] = useState<Step>('idea');
  const [projectData, setProjectData] = useState<ProjectData>({
    idea: '',
    concept: '',
    screenplay: '',
    storychars: null,
    trailer: null,
    trailerArtifacts: { storyboardShots: [], stills: [], clips: [], startedPrefixes: []  }, 
  });

  // options state (lives in App, controlled in IdeaStep)
  const [ragEnabled, setRagEnabled] = useState(false);
  const [scope, setScope] = useState<Scope>('trailer');
  const [writerMode, setWriterMode] = useState<WriterMode>('single_writer');
  const [modelProvider, setModelProvider] = useState<ModelProvider>('openai');
  const [isStoryboardGenerating, setIsStoryboardGenerating] = useState(false);
  const [storyboardError, setStoryboardError] = useState<string | null>(null);

  // Auto-Forge state
  const [isAutoRun, setIsAutoRun] = useState(false);
  const [autoRunStatus, setAutoRunStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [autoRunError, setAutoRunError] = useState<string | null>(null);
  const autoProgressRef = useRef<number>(0); // 0..4

  // refs for auto-scroll
  const stepRefs = {
    idea: useRef<HTMLDivElement | null>(null),
    concept: useRef<HTMLDivElement | null>(null),
    screenplay: useRef<HTMLDivElement | null>(null),
    storychars: useRef<HTMLDivElement | null>(null),
    trailer: useRef<HTMLDivElement | null>(null),
  };

  // screenplay store sync
  const sp = useScreenplayStore();
  useEffect(() => { sp.set(projectData.screenplay || ""); }, []);
  useEffect(() => { sp.set(projectData.screenplay || ""); }, [projectData.screenplay]);
  useEffect(() => { updateProjectData("screenplay", sp.text); }, [sp.text]);

  // auto-scroll to active section
  useEffect(() => {
    stepRefs[currentStep]?.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [currentStep]);

  const updateProjectData = (key: keyof ProjectData, value: any) => {
    setProjectData(prev => {
      if (key === 'concept') {
        if (value === prev.concept) return prev;
        return {
          ...prev,
          concept: value,
          storychars: null,
          trailer: null,
          // keep trailerArtifacts but clear storyboard-derived bits
          trailerArtifacts: {
            storyboardShots: [],
            stills: [],
            clips: [],
          },
        };
      }
      if (key === 'screenplay') {
        if (value === prev.screenplay) return prev;
        return {
          ...prev,
          screenplay: value,
          storychars: null,
          trailer: null,
          trailerArtifacts: {
            storyboardShots: [],
            stills: [],
            clips: [],
          },
        };
      }
      if (value === prev[key]) return prev;
      return { ...prev, [key]: value } as ProjectData;
    });
  };

  // NEW: centralized updater for trailer artifacts
  const updateTrailerArtifacts = (patch: Partial<ProjectData["trailerArtifacts"]>) => {
    setProjectData(prev => {
      const base = prev.trailerArtifacts ?? { storyboardShots: [], stills: [], clips: [], startedPrefixes: [] };
      return { ...prev, trailerArtifacts: { ...base, ...patch } };
    });
  };

  const nextStep = () => {
    const steps: Step[] = ['idea', 'concept', 'screenplay', 'storychars', 'trailer'];
    const i = steps.indexOf(currentStep);
    if (i < steps.length - 1) setCurrentStep(steps[i + 1]);
  };

  const goToStep = (step: Step) => setCurrentStep(step);

  const handleModelProviderChange = (provider: ModelProvider) => {
    const nextProvider = provider === 'claude' ? 'openai' : provider;
    if (nextProvider === modelProvider) return;
    setModelProvider(nextProvider);
    setProjectData(prev => ({
      ...prev,
      concept: '',
      screenplay: '',
      storychars: null,
      trailer: null,
      trailerArtifacts: { storyboardShots: [], stills: [], clips: [], startedPrefixes: [] },
    }));
  };

  /**
   * Generate storyboard/characters (returns payload so orchestrator can use it immediately)
   */
  const handleGenerateStoryboard = async (script: string): Promise<StoryboardCharactersPayload | null> => {
    if (isStoryboardGenerating || !script.trim()) return null;
    setStoryboardError(null);
    setIsStoryboardGenerating(true);
    setProjectData(prev => ({ ...prev, storychars: null, trailer: null }));
    setCurrentStep('storychars');

    try {
      const res = await fetch("/api/storyboard-characters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          screenplay: script,
          look: "color",
          aspect: "landscape",
          provider: modelProvider,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || `Storyboard request failed (${res.status})`);
      }

      const payload: StoryboardCharactersPayload = {
        shots: json.shots || [],
        characters: json.characters || [],
        mapping: json.mapping || {},
      };

      // persist into projectData
      setProjectData(prev => ({
        ...prev,
        storychars: payload,
        // seed trailerArtifacts.storyboardShots so Trailer can display immediately
        trailerArtifacts: {
          ...(prev.trailerArtifacts ?? { storyboardShots: [], stills: [], clips: [] }),
          storyboardShots: (payload.shots || []).map(s => ({ id: s.id, prompt: s.prompt, negative: s.negative })),
          // keep any existing stills/clips
          stills: prev.trailerArtifacts?.stills ?? [],
          clips: prev.trailerArtifacts?.clips ?? [],
        }
      }));

      return payload;
    } catch (err) {
      console.error("Failed to generate storyboard", err);
      const message =
        err instanceof Error ? err.message : typeof err === "string" ? err : "Unknown error";
      setStoryboardError(message);
      throw err;
    } finally {
      setIsStoryboardGenerating(false);
    }
  };

  const retryGenerateStoryboard = () => {
    if (!projectData.screenplay?.trim()) return;
    void handleGenerateStoryboard(projectData.screenplay);
  };

  // ---- Auto-Forge Orchestrator ----
  async function runFullWorkflow() {
    if (isAutoRun) return;
    setIsAutoRun(true);
    setAutoRunStatus('running');
    setAutoRunError(null);
    autoProgressRef.current = 0;

    try {
      // 1) Concept
      setCurrentStep('concept');
      const concept = await generateConceptStep({
        idea: projectData.idea,
        provider: modelProvider,
      });
      updateProjectData('concept', concept);
      autoProgressRef.current = 1;

      // 2) Screenplay
      setCurrentStep('screenplay');
      const screenplay = await generateScreenplayStep({
        concept,
        provider: modelProvider,
      });
      updateProjectData('screenplay', screenplay);
      autoProgressRef.current = 2;

      // 3) Storyboard / Characters
      setCurrentStep('storychars');
      const storychars = await handleGenerateStoryboard(screenplay);
      autoProgressRef.current = 3;

      // 4) Trailer
      setCurrentStep('trailer');
      const trailer = await generateTrailerStep({
        screenplay,
        provider: modelProvider,
        storychars: storychars ?? projectData.storychars,
      });
      updateProjectData('trailer', trailer);
      autoProgressRef.current = 4;

      setAutoRunStatus('done');
    } catch (err) {
      const message = err instanceof Error ? err.message : typeof err === 'string' ? err : 'Unknown error';
      setAutoRunError(message);
      setAutoRunStatus('error');
    } finally {
      setIsAutoRun(false);
    }
  }
  // ---------------------------------

  const progressPct = Math.min(100, Math.round((autoProgressRef.current / 4) * 100));

  // derive initial shots for Trailer:
  const initialTrailerShots =
    projectData.trailerArtifacts?.storyboardShots?.length
      ? projectData.trailerArtifacts.storyboardShots
      : (projectData.storychars?.shots ?? []).map(s => ({ id: s.id, prompt: s.prompt, negative: s.negative }));

  return (
    <FilmforgeChatProvider>
      <div className="min-h-screen bg-[#0e111a] text-slate-100 flex">
        <div className="hidden lg:block w-80 flex-shrink-0 border-r border-white/5">
          <GlobalChatSidebar />
        </div>

        <div className="flex-1 relative overflow-hidden">
          {/* Cinematic Background */}
          <div className="absolute inset-0 opacity-50">
            <img
              src="https://images.unsplash.com/photo-1616527546362-bf6b7f80a751?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxmaWxtJTIwcHJvZHVjdGlvbiUyMGNpbmVtYXxlbnwxfHx8fDE3NjE4MDQ0MDB8MA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral"
              alt=""
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-black/70 to-black/80"></div>
          </div>

          {/* Film Grain Texture */}
          <div className="absolute inset-0 opacity-[0.03] pointer-events-none mix-blend-overlay">
            <div
              className="absolute inset-0"
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
                backgroundRepeat: "repeat",
              }}
            ></div>
          </div>

          {/* Gradient Overlays */}
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-purple-500/30 rounded-full blur-[140px] animate-pulse"></div>
          <div
            className="absolute bottom-0 right-1/4 w-96 h-96 bg-blue-500/20 rounded-full blur-[140px] animate-pulse"
            style={{ animationDelay: "1s" }}
          ></div>

          {/* Content */}
          <div className="relative z-10 flex flex-col min-h-screen">
          {/* Header */}
          <div className="border-b border-white/10 bg-black/30 backdrop-blur-xl py-8">
            <div className="px-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <div className="relative">
                      <Sparkles className="w-8 h-8 text-purple-400" />
                      <div className="absolute inset-0 blur-xl bg-purple-500/50"></div>
                    </div>
                    <h1 className="text-white">FilmForge AI</h1>
                  </div>
                  <p className="text-gray-400">Transform your ideas into cinematic stories</p>
                </div>
                <Badge variant="outline" className="bg-purple-500/10 text-purple-300 border-purple-500/30">
                  Beta v1.0
                </Badge>
              </div>

              {/* Control bar */}
              <div className="mt-6 flex flex-col gap-3">
               
              </div>
            </div>
          </div>

          <div className="px-6 py-8 flex-1 min-h-0 overflow-auto">
            <WorkflowSteps
              currentStep={currentStep}
              projectData={projectData}
              onStepClick={goToStep}
            />

            <div className="mt-8 space-y-8">
              <div id="idea" ref={stepRefs.idea}>
                {currentStep === 'idea' && (
                  <IdeaStep
                    idea={projectData.idea}
                    concept={projectData.concept}
                    ragEnabled={ragEnabled}
                    scope={scope}
                    writerMode={writerMode}
                    modelProvider={modelProvider}
                    onToggleRag={setRagEnabled}
                    onScopeChange={setScope}
                    onWriterModeChange={setWriterMode}
                    onModelProviderChange={handleModelProviderChange}
                    onUpdate={(v) => updateProjectData('idea', v)}
                    onConcept={(v) => updateProjectData('concept', v)}
                    onNext={nextStep}
                    onRunFullWorkflow={runFullWorkflow}
                    isAutoRun={isAutoRun}
                    autoRunStatus={autoRunStatus}
                    autoRunError={autoRunError}
                    autoRunProgressPct={progressPct}
                  />
                )}
              </div>

              <div id="concept" ref={stepRefs.concept}>
                {currentStep === 'concept' && (
                  <ConceptStep
                    idea={projectData.idea}
                    concept={projectData.concept}
                    screenplay={projectData.screenplay}
                    modelProvider={modelProvider}
                    onUpdate={(v) => updateProjectData('concept', v)}
                    onScreenplay={(v) => updateProjectData('screenplay', v)}
                    onNext={nextStep}
                    onBack={() => goToStep('idea')}
                  />
                )}
              </div>

              <div id="screenplay" ref={stepRefs.screenplay}>
                {currentStep === 'screenplay' && (
                  <ScreenplayStep
                    concept={projectData.concept}
                    screenplay={projectData.screenplay}
                    modelProvider={modelProvider}
                    onUpdate={(v) => updateProjectData('screenplay', v)}
                    onGenerateStoryboard={(script) => handleGenerateStoryboard(script)}
                    isStoryboardGenerating={isStoryboardGenerating}
                    hasStoryboard={Boolean(projectData.storychars)}
                    onContinueToStoryboard={() => goToStep('storychars')}
                    onBack={() => goToStep('concept')}
                  />
                )}
              </div>

              <div id="storychars" ref={stepRefs.storychars}>
                {currentStep === 'storychars' && (
                  <StoryboardCharactersStep
                    data={projectData.storychars}
                    screenplay={projectData.screenplay}
                    loading={isStoryboardGenerating}
                    error={storyboardError}
                    onRetry={retryGenerateStoryboard}
                    onNext={nextStep}
                    onBack={() => goToStep('screenplay')}
                  />
                )}
              </div>

              <div id="trailer" ref={stepRefs.trailer}>
                {currentStep === 'trailer' && (
                  <TrailerStep
                    screenplay={projectData.screenplay}
                    trailer={projectData.trailer}
                    modelProvider={modelProvider}
                    onUpdate={(v) => updateProjectData('trailer', v)}
                    onBack={() => goToStep('storychars')}

                    // NEW: persist/display artifacts
                    initialShots={initialTrailerShots}
                    initialStills={projectData.trailerArtifacts?.stills ?? []}
                    initialClips={projectData.trailerArtifacts?.clips ?? []}
                    initialStartedPrefixes={projectData.trailerArtifacts?.startedPrefixes?? []}
                    onArtifactsChange={updateTrailerArtifacts}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </FilmforgeChatProvider>
  );
}