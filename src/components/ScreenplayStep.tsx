import { generateWithModel } from "@/lib/generateWithModel";
import { screenplayPrompts } from "@/prompts";

import { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Film, ArrowRight, ArrowLeft, Sparkles, RefreshCw, Download, MessageSquare } from 'lucide-react';
import { Textarea } from './ui/textarea';
import { ChatBox, Message } from './ChatBox';
import type { ModelProvider } from '@/types/model';
import type { StoryboardCharactersPayload } from "./StoryboardCharactersStep";

interface ScreenplayStepProps {
  concept: string;
  screenplay: string;
  modelProvider: ModelProvider;
  onUpdate: (value: string) => void;
  onGenerateStoryboard: (screenplay: string, options?: { autoPortraits?: boolean }) => void | Promise<void | StoryboardCharactersPayload | null>;
  isStoryboardGenerating: boolean;
  hasStoryboard: boolean;
  onContinueToStoryboard: () => void;
  onBack: () => void;
}

export function ScreenplayStep({
  concept,
  screenplay,
  modelProvider,
  onUpdate,
  onGenerateStoryboard,
  isStoryboardGenerating,
  hasStoryboard,
  onContinueToStoryboard,
  onBack,
}: ScreenplayStepProps) {
  const [localScreenplay, setLocalScreenplay] = useState(screenplay);
  const [isGenerating, setIsGenerating] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const hasAutoRequested = useRef(false);
  const lastConcept = useRef(concept);

  const generateScreenplay = async () => {
    if (isGenerating) return;
    setIsGenerating(true);
    try {
      const system = screenplayPrompts.system;
      const prompt = screenplayPrompts.buildUserPrompt(concept);
      const text = await generateWithModel({
        provider: modelProvider,
        prompt,
        system,
      });
      const output = text || 'No response';
      setLocalScreenplay(output);
      onUpdate(output);
    } catch (err) {
      console.error('Failed to generate screenplay', err);
    } finally {
      setIsGenerating(false);
    }
  };

  // Keep local state in sync with parent prop (e.g., when concept changes and parent clears screenplay)
  useEffect(() => {
    setLocalScreenplay(screenplay);
    if (!screenplay?.trim()) {
      hasAutoRequested.current = false;
    }
  }, [screenplay]);

  useEffect(() => {
    if (concept !== lastConcept.current) {
      lastConcept.current = concept;
      hasAutoRequested.current = false;
    }
  }, [concept]);

  useEffect(() => {
    if (hasAutoRequested.current) return;
    if (!concept?.trim()) return;
    if (localScreenplay?.trim()) return;
    hasAutoRequested.current = true;
    void generateScreenplay();
  }, [concept, localScreenplay]);

  const handleDownload = () => {
    const element = document.createElement('a');
    const file = new Blob([localScreenplay], { type: 'text/plain' });
    element.href = URL.createObjectURL(file);
    element.download = 'screenplay.txt';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const handleGenerateStoryboardClick = useCallback(async () => {
    if (isGenerating || isStoryboardGenerating || !localScreenplay.trim()) return;
    onUpdate(localScreenplay);
    await onGenerateStoryboard(localScreenplay);
  }, [isGenerating, isStoryboardGenerating, localScreenplay, onGenerateStoryboard, onUpdate]);



  return (
    <div className="space-y-6">
      {isGenerating ? (
        <Card className="bg-slate-800/50 border-slate-700 backdrop-blur">
          <CardContent className="py-12">
            <div className="flex flex-col items-center justify-center space-y-4">
              <Sparkles className="w-12 h-12 text-purple-400 animate-pulse" />
              <p className="text-slate-300">Generating your screenplay...</p>
              <p className="text-sm text-slate-500">This may take a moment...</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="gap-6">
            {/* Screenplay Editor */}
            <Card className="bg-slate-800/50 border-slate-700 backdrop-blur">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-white">
                  <Film className="w-6 h-6 text-green-400" />
                  Screenplay
                </CardTitle>
                <CardDescription className="text-slate-300">
                  AI-generated screenplay. Edit manually or use chat to refine.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <label className="text-sm text-slate-300">Generated Screenplay</label>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleDownload}
                        className="bg-slate-900/50 border-slate-600 text-slate-300 hover:bg-slate-900 hover:text-white"
                      >
                        <Download className="w-3 h-3 mr-2" />
                        Download
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={generateScreenplay}
                        disabled={isGenerating}
                        className="bg-slate-900/50 border-slate-600 text-slate-300 hover:bg-slate-900 hover:text-white disabled:opacity-60"
                      >
                        <RefreshCw className="w-3 h-3 mr-2" />
                        Regenerate
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleGenerateStoryboardClick}
                        disabled={isGenerating || isStoryboardGenerating || !localScreenplay.trim()}
                        className="bg-purple-600 hover:bg-purple-700 disabled:opacity-60"
                      >
                        Generate Storyboard
                        <ArrowRight className="w-4 h-4 ml-2" />
                      </Button>
                    </div>
                  </div>
                  <Textarea
                    value={localScreenplay}
                    onChange={(e) => { setLocalScreenplay(e.target.value); onUpdate(e.target.value); }}
                    className="min-h-96 bg-slate-900/50 border-slate-600 text-white font-mono text-sm"
                  />
                </div>
              </CardContent>
            </Card>

          
          
          </div>

          {/* Navigation */}
          <div className="flex justify-between">
            <Button
              variant="outline"
              onClick={onBack}
              className="bg-slate-900/50 border-slate-600 text-slate-300 hover:bg-slate-900 hover:text-white"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Concept
            </Button>
            <Button
              onClick={() => {
                if (isGenerating) return;
                onUpdate(localScreenplay);
                onContinueToStoryboard();
              }}
              disabled={!hasStoryboard || isGenerating}
              className="bg-purple-600 hover:bg-purple-700 disabled:opacity-60"
            >
              Continue to Storyboard
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
