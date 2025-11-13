import { conceptPrompts } from "@/prompts";

import { useState, useEffect, useRef, useMemo } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { FileText, ArrowRight, ArrowLeft, Sparkles, RefreshCw, MessageSquare } from 'lucide-react';
import { Textarea } from './ui/textarea';
import { ChatBox, Message } from './ChatBox';
import type { ModelProvider } from '@/types/model';
import { generateWithModel } from "@/lib/generateWithModel";

interface ConceptStepProps {
  idea: string;
  concept: string;
  screenplay: string;
  modelProvider: ModelProvider;
  onUpdate: (value: string) => void;
  onScreenplay: (value: string) => void;
  onNext: () => void;
  onBack: () => void;
}

export function ConceptStep({ idea, concept, screenplay, modelProvider, onUpdate, onScreenplay, onNext, onBack }: ConceptStepProps) {
  const [localConcept, setLocalConcept] = useState(concept);
  const [isGenerating, setIsGenerating] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [isScreenplayGenerating, setIsScreenplayGenerating] = useState(false);
  const hasAutoRequested = useRef(false);
  const lastIdea = useRef(idea);

  const generateConcept = async () => {
    if (isGenerating) return;
    if (!idea?.trim()) {
      onUpdate("[No idea provided. Please describe your film idea first.]");
      return;
    }
    setIsGenerating(true);
    try {
      const system = conceptPrompts.system;
      const prompt = conceptPrompts.buildUserPrompt(idea);

      const text = await generateWithModel({
        provider: modelProvider,
        prompt,
        system,
      });
      const output = (text || "No response").trim();
      setLocalConcept(output);
      onUpdate(output);
    } catch (err) {
      console.error("Failed to generate concept", err);
      onUpdate("[ERROR] " + String(err));
    } finally {
      setIsGenerating(false);
    }
  };

  useEffect(() => {
    setLocalConcept(concept);
    if (!concept?.trim()) {
      hasAutoRequested.current = false;
    }
  }, [concept]);

  useEffect(() => {
    if (idea !== lastIdea.current) {
      lastIdea.current = idea;
      hasAutoRequested.current = false;
    }
  }, [idea]);

  useEffect(() => {
    if (hasAutoRequested.current) return;
    if (!idea?.trim()) return;
    if (localConcept?.trim()) return;
    hasAutoRequested.current = true;
    void generateConcept();
  }, [idea, localConcept]);

  const generateButtonLabel = useMemo(
    () => (localConcept.trim() ? "Regenerate Concept" : "Generate Concept"),
    [localConcept],
  );

  const handleNext = () => {
    if (localConcept !== concept) {
      onUpdate(localConcept);
    }
    onNext();
  };

  const generateScreenplayFromConcept = () => {
    if (isScreenplayGenerating) return;
    if (!localConcept.trim()) return;
    setIsScreenplayGenerating(true);

    if (localConcept !== concept) {
      onUpdate(localConcept);
    }

    onScreenplay("");
    onNext();
  };

 

  return (
    <div className="space-y-6">
      {isGenerating ? (
        <Card className="bg-slate-800/50 border-slate-700 backdrop-blur">
          <CardContent className="py-12">
            <div className="flex flex-col items-center justify-center space-y-4">
              <Sparkles className="w-12 h-12 text-purple-400 animate-pulse" />
              <p className="text-slate-300">Generating your film concept...</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="gap-6">
            {/* Concept Editor */}
            <Card className="bg-slate-800/50 border-slate-700 backdrop-blur">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-white">
                  <FileText className="w-6 h-6 text-blue-400" />
                  Film Concept
                </CardTitle>
                <CardDescription className="text-slate-300">
                  AI-generated concept based on your idea. Edit manually or use chat to refine.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <label className="text-sm text-slate-300">Generated Concept</label>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={generateConcept}
                        disabled={isGenerating}
                        className="bg-slate-900/50 border-slate-600 text-slate-300 hover:bg-slate-900 hover:text-white disabled:opacity-60"
                      >
                        <RefreshCw className="w-3 h-3 mr-2" />
                        {generateButtonLabel}
                      </Button>
                      <Button
                        size="sm"
                        onClick={generateScreenplayFromConcept}
                        disabled={!localConcept.trim() || isScreenplayGenerating}
                        className="bg-purple-600 hover:bg-purple-700 disabled:opacity-60"
                      >
                        Generate Screenplay
                        <ArrowRight className="w-4 h-4 ml-2" />
                      </Button>
                    </div>
                  </div>
                  <Textarea
                    value={localConcept}
                    onChange={(e) => setLocalConcept(e.target.value)}
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
              Back to Idea
            </Button>

            <Button
              onClick={handleNext}
              disabled={!screenplay.trim()}
              className="bg-purple-600 hover:bg-purple-700 disabled:opacity-50"
            >
              Continue to Screenplay
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

// Removed local mock generators in favor of Bedrock-backed generation
