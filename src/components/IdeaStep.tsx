// src/components/IdeaStep.tsx
import { useEffect, useState } from "react";
import type { ChangeEvent, DragEvent } from "react";
import {
  Lightbulb,
  FileText,
  Upload,
  Info,
  ChevronRight,
  Palette,
  Music,
  Film,
  Sparkles,
  Play,
} from "lucide-react";
import type { Scope, WriterMode } from "@/App";
import type { ModelProvider } from "@/types/model";

import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Card } from "./ui/card";
import { Badge } from "./ui/badge";
import { Progress } from "./ui/progress";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/tooltip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "./ui/collapsible";

type IdeaStepProps = {
  idea: string;
  concept?: string;
  ragEnabled: boolean;
  scope: Scope;
  writerMode: WriterMode;
  modelProvider: ModelProvider;
  onToggleRag: (enabled: boolean) => void;
  onScopeChange: (scope: Scope) => void;
  onWriterModeChange: (mode: WriterMode) => void;
  onModelProviderChange: (provider: ModelProvider) => void;
  onUpdate: (value: string) => void;
  onConcept?: (value: string) => void;
  onNext: () => void;
  onRunFullWorkflow: () => void;
  isAutoRun: boolean;
  autoRunStatus: "idle" | "running" | "done" | "error";
  autoRunError: string | null;
  autoRunProgressPct: number;
};

const EXAMPLE_PROMPTS = [
  "A detective in a cyberpunk city must solve crimes using memories extracted from victims.",
  "Two rival chefs compete in a cooking show that determines the fate of their restaurants.",
  "A time traveler accidentally changes history and must fix it before disappearing.",
];

const MODEL_PROVIDER_OPTIONS: Array<{ value: ModelProvider; label: string; disabled?: boolean }> = [
  { value: "openai", label: "OpenAI" },
  { value: "claude", label: "Anthropic Claude (coming soon)", disabled: true },
];

function IdeaStep({
  idea,
  concept,
  ragEnabled,
  scope,
  writerMode,
  modelProvider,
  onToggleRag,
  onScopeChange,
  onWriterModeChange,
  onModelProviderChange,
  onUpdate,
  onConcept,
  onNext,
  onRunFullWorkflow,
  isAutoRun,
  autoRunStatus,
  autoRunError,
  autoRunProgressPct,
}: IdeaStepProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [inputMode, setInputMode] = useState<"type" | "upload">("type");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [genre, setGenre] = useState("drama");
  const [tone, setTone] = useState("balanced");
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [isDirty, setIsDirty] = useState<boolean>(() => !concept?.trim());

  useEffect(() => {
    if (concept?.trim()) {
      setIsDirty(false);
    } else {
      setIsDirty(true);
    }
  }, [concept]);

  useEffect(() => {
    if (writerMode === "multiple_writers") {
      onWriterModeChange("single_writer");
    }
  }, [writerMode, onWriterModeChange]);

  useEffect(() => {
    if (modelProvider === "claude") {
      onModelProviderChange("openai");
    }
  }, [modelProvider, onModelProviderChange]);

  const readTextFile = async (file: File) => {
    try {
      const text = await file.text();
      onUpdate(text);
      onConcept?.("");
      setInputMode("type");
      setSelectedFile(null);
      setIsDirty(true);
    } catch {
      // ignore parse errors; UI keeps file indicator visible
    }
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    setInputMode("upload");
    void readTextFile(file);
  };

  const handleFileSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    setInputMode("upload");
    event.target.value = "";
    void readTextFile(file);
  };

  const handleExampleClick = (example: string) => {
    onUpdate(example);
    onConcept?.("");
    setInputMode("type");
    setIsDirty(true);
  };

  const getCharacterProgress = () => {
    const length = idea.length;
    if (length < 50) {
      return { color: "text-red-400", percent: (length / 200) * 100 };
    }
    if (length < 100) {
      return { color: "text-yellow-400", percent: (length / 200) * 100 };
    }
    return { color: "text-green-400", percent: Math.min((length / 200) * 100, 100) };
  };

  const handleGenerateClick = async () => {
    const trimmed = idea.trim();
    if (!trimmed) return;
    onUpdate(trimmed);
    setIsDirty(false);
    onNext();
  };

  const charProgress = getCharacterProgress();
  const isGenerateDisabled = !idea.trim();
  const hasExistingConcept = Boolean(concept?.trim());
  const canContinue = hasExistingConcept && !isDirty;

  const handleIdeaChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    const value = event.target.value;
    setIsDirty(true);
    onConcept?.("");
    onUpdate(value);
  };

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* Film Strip Divider */}
        <div className="relative">
          <div className="h-12 bg-gradient-to-r from-transparent via-white/5 to-transparent flex items-center justify-center gap-1">
            {Array.from({ length: 20 }).map((_, index) => (
              <div key={index} className="w-1 h-8 bg-white/20 rounded-full" />
            ))}
          </div>
        </div>

        {/* Full Workflow launcher */}
        <div className="rounded-2xl border border-purple-400/50 bg-purple-400/10 p-4 space-y-3 shadow-lg shadow-purple-900/30">
          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={onRunFullWorkflow}
              disabled={isAutoRun}
              className="bg-purple-600 hover:bg-purple-700 text-white flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <Play className="w-4 h-4" />
              {isAutoRun ? "Running Full Workflow…" : "Run Full Workflow"}
            </Button>

            {isAutoRun && (
              <div className="flex-1 min-w-[160px] h-2 bg-white/10 rounded overflow-hidden">
                <div
                  className="h-full bg-purple-500 transition-all duration-300"
                  style={{ width: `${autoRunProgressPct}%` }}
                />
              </div>
            )}
          </div>

          {autoRunStatus === "error" && (
            <div className="text-sm text-red-400">
              Failed: {autoRunError || "Unknown error"}
            </div>
          )}
          {autoRunStatus === "done" && (
            <div className="text-sm text-green-400">Workflow complete. 🎬</div>
          )}
          {isAutoRun && autoRunStatus !== "error" && (
            <div className="text-xs text-purple-200 uppercase tracking-wide">
              Auto-forge in progress…
            </div>
          )}
        </div>

        {/* Main Form Card */}
        <Card className="p-8 shadow-2xl shadow-purple-800/30 bg-gradient-to-br from-slate-800/90 to-slate-900/90 border border-white/15 backdrop-blur-xl">
          <div className="mb-6">
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-start gap-2">
                <Lightbulb className="w-5 h-5 text-purple-400 mt-1" />
                <div>
                  <h2 className="text-white">What&apos;s Your Film Idea?</h2>
                  <p className="text-gray-400 text-sm mt-1">
                    Start with a simple concept, logline, or story premise. Let your creativity flow!
                  </p>
                </div>
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="text-gray-400 hover:text-white">
                    <Info className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="bg-gray-800 border-white/20 text-white max-w-xs">
                  <p>Describe your story idea in 50-200 characters. Include the main character, conflict, and hook.</p>
                </TooltipContent>
              </Tooltip>
            </div>
          </div>

          {/* Input Tabs */}
          <Tabs
            value={inputMode}
            onValueChange={(value) => setInputMode(value as "type" | "upload")}
            className="mb-6"
          >
            <TabsList className="grid w-full grid-cols-2 bg-white/10 border border-white/15 rounded-xl p-1">
              <TabsTrigger
                value="type"
                className="flex items-center justify-center gap-2 rounded-lg text-white/70 transition-all data-[state=active]:bg-purple-500/30 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=inactive]:hover:bg-white/10 data-[state=inactive]:hover:text-white"
              >
                <FileText className="w-5 h-5" />
                Type Your Idea
              </TabsTrigger>
              <TabsTrigger
                value="upload"
                className="flex items-center justify-center gap-2 rounded-lg text-white/70 transition-all data-[state=active]:bg-purple-500/30 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=inactive]:hover:bg-white/10 data-[state=inactive]:hover:text-white"
              >
                <Upload className="w-5 h-5" />
                Upload File
              </TabsTrigger>
            </TabsList>

            <TabsContent value="type" className="mt-6 space-y-4">
              <Textarea
                value={idea}
                onChange={handleIdeaChange}
                placeholder="Example: A detective in a cyberpunk city must solve crimes using memories extracted from victims..."
                className="min-h-32 border-white/20 bg-white/5 text-white placeholder:text-gray-500 focus:border-purple-500 focus:bg-white/10"
              />
              <div className="flex items-center justify-between mt-2">
                <div className="flex items-center gap-2">
                  <Progress value={charProgress.percent} className="w-32 h-1.5 bg-white/10" />
                  <span className={`text-sm ${charProgress.color}`}>{idea.length} characters</span>
                </div>
                {idea.length < 50 && idea.length > 0 && (
                  <span className="text-xs text-yellow-400">Add more detail (min 50 characters)</span>
                )}
              </div>
              {!canContinue && (
                <div className="flex justify-end">
                  <Button
                    type="button"
                    onClick={handleGenerateClick}
                    className="h-11 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 shadow-lg shadow-purple-500/30 hover:shadow-purple-500/50 px-6 flex items-center gap-2"
                    disabled={isGenerateDisabled}
                  >
                    <Sparkles className="w-5 h-5" />
                    Generate Concept
                  </Button>
                </div>
              )}
            </TabsContent>

            <TabsContent value="upload" className="mt-6">
              {!selectedFile ? (
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`border-2 border-dashed rounded-lg p-8 text-center transition-all ${
                    isDragging
                      ? "border-purple-500 bg-purple-500/10"
                      : "border-white/20 bg-white/5 hover:border-purple-500/50 hover:bg-white/10"
                  }`}
                >
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-16 h-16 rounded-full bg-purple-500/20 flex items-center justify-center">
                      <Upload className="w-8 h-8 text-purple-400" />
                    </div>
                    <div>
                      <p className="text-white mb-1">Drag & drop your script here</p>
                      <p className="text-sm text-gray-400">or click to browse files</p>
                    </div>
                    <label>
                      <input
                        type="file"
                        accept=".txt"
                        onChange={handleFileSelect}
                        className="hidden"
                      />
                      <Button
                        variant="outline"
                        className="border-white/20 bg-white/5 text-white hover:bg-white/10"
                        asChild
                      >
                        <span>Choose File</span>
                      </Button>
                    </label>
                  </div>
                </div>
              ) : (
                <div className="p-4 bg-gradient-to-br from-green-900/30 to-emerald-900/30 border border-green-500/30 rounded-lg backdrop-blur-sm">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-green-500/20 rounded-lg flex items-center justify-center border border-green-500/30">
                        <FileText className="w-5 h-5 text-green-400" />
                      </div>
                      <div>
                        <p className="text-green-100 truncate max-w-[16rem]">{selectedFile.name}</p>
                        <p className="text-sm text-green-400">
                          {(selectedFile.size / 1024).toFixed(2)} KB
                        </p>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedFile(null)}
                      className="text-green-400 hover:text-green-300 hover:bg-green-500/10"
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>

          {/* Film Strip Divider */}
          <div className="relative my-6">
            <div className="h-8 bg-gradient-to-r from-transparent via-white/5 to-transparent flex items-center justify-center gap-1">
              {Array.from({ length: 30 }).map((_, index) => (
                <div key={index} className="w-0.5 h-6 bg-white/20 rounded-full" />
              ))}
            </div>
          </div>

          {/* Configuration Options */}
          <div className="space-y-6 mb-6">
            <div className="grid md:grid-cols-3 gap-6">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <label className="text-gray-300">Scope</label>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="w-3.5 h-3.5 text-gray-500 cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="bg-gray-800 border-white/20 text-white">
                      <p>Choose the length and format of your film project.</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <Select value={scope} onValueChange={(value) => onScopeChange(value as Scope)}>
                  <SelectTrigger className="border-white/20 bg-white/5 text-white hover:bg-white/10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-900 border-white/20 text-white">
                    <SelectItem value="trailer">
                      🎞️ Trailer
                    </SelectItem>
                    <SelectItem value="short_film" disabled>
                      🎬 Short Film (Disabled)
                    </SelectItem>
                    <SelectItem value="feature_film" disabled>
                      🎥 Full Feature Film (Disabled)
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <div className="flex items-center gap-2 mb-2">
                  <label className="text-gray-300">Writer Mode</label>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="w-3.5 h-3.5 text-gray-500 cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="bg-gray-800 border-white/20 text-white">
                      <p>Choose a single writer for speed, or multiple writers for collaborative polish.</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <Select
                  value={writerMode}
                  onValueChange={(value) => onWriterModeChange(value as WriterMode)}
                >
                  <SelectTrigger className="border-white/20 bg-white/5 text-white hover:bg-white/10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-900 border-white/20 text-white">
                    <SelectItem value="single_writer">✍️ Single Writer</SelectItem>
                    <SelectItem value="multiple_writers" disabled>
                      🧑‍🤝‍🧑 Multiple Writers (coming soon)
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <div className="flex items-center gap-2 mb-2">
                  <label className="text-gray-300">LLM Provider</label>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="w-3.5 h-3.5 text-gray-500 cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="bg-gray-800 border-white/20 text-white">
                      <p>Select which model powers generation.</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <Select
                  value={modelProvider}
                  onValueChange={(value) => onModelProviderChange(value as ModelProvider)}
                >
                  <SelectTrigger className="border-white/20 bg-white/5 text-white hover:bg-white/10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-900 border-white/20 text-white">
                    {MODEL_PROVIDER_OPTIONS.map((option) => (
                      <SelectItem
                        key={option.value}
                        value={option.value}
                        disabled={option.disabled}
                      >
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Advanced Options */}
            <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
              <CollapsibleTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full text-purple-400 hover:text-purple-300 hover:bg-white/5"
                >
                  {showAdvanced ? "▼" : "▶"} Advanced Options
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-6 mt-6">
                <div className="grid md:grid-cols-3 gap-6">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Palette className="w-4 h-4 text-purple-400" />
                      <label className="text-gray-300">Genre</label>
                    </div>
                    <Select value={genre} onValueChange={setGenre}>
                      <SelectTrigger className="border-white/20 bg-white/5 text-white hover:bg-white/10">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-gray-900 border-white/20 text-white">
                        <SelectItem value="drama">Drama (Default)</SelectItem>
                        <SelectItem value="action" disabled>
                          Action (Coming soon)
                        </SelectItem>
                        <SelectItem value="comedy" disabled>
                          Comedy (Coming soon)
                        </SelectItem>
                        <SelectItem value="horror" disabled>
                          Horror (Coming soon)
                        </SelectItem>
                        <SelectItem value="sci-fi" disabled>
                          Sci-Fi (Coming soon)
                        </SelectItem>
                        <SelectItem value="thriller" disabled>
                          Thriller (Coming soon)
                        </SelectItem>
                        <SelectItem value="romance" disabled>
                          Romance (Coming soon)
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Music className="w-4 h-4 text-purple-400" />
                      <label className="text-gray-300">Tone</label>
                    </div>
                    <Select value={tone} onValueChange={setTone}>
                      <SelectTrigger className="border-white/20 bg-white/5 text-white hover:bg-white/10">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-gray-900 border-white/20 text-white">
                        <SelectItem value="balanced">Balanced (Default)</SelectItem>
                        <SelectItem value="lighthearted" disabled>
                          Lighthearted (Coming soon)
                        </SelectItem>
                        <SelectItem value="serious" disabled>
                          Serious (Coming soon)
                        </SelectItem>
                        <SelectItem value="dark" disabled>
                          Dark (Coming soon)
                        </SelectItem>
                        <SelectItem value="epic" disabled>
                          Epic (Coming soon)
                        </SelectItem>
                        <SelectItem value="intense" disabled>
                          Intense (Coming soon)
                        </SelectItem>
                        <SelectItem value="melancholic" disabled>
                          Melancholic (Coming soon)
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Film className="w-4 h-4 text-purple-400" />
                      <label className="text-gray-300">Aspect Ratio</label>
                    </div>
                    <Select value={aspectRatio} onValueChange={setAspectRatio}>
                      <SelectTrigger className="border-white/20 bg-white/5 text-white hover:bg-white/10">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-gray-900 border-white/20 text-white">
                        <SelectItem value="16:9">16:9 (Standard)</SelectItem>
                        <SelectItem value="2.35:1" disabled>
                          2.35:1 (Cinematic – Coming soon)
                        </SelectItem>
                        <SelectItem value="1.85:1" disabled>
                          1.85:1 (Theatrical – Coming soon)
                        </SelectItem>
                        <SelectItem value="4:3" disabled>
                          4:3 (Classic – Coming soon)
                        </SelectItem>
                        <SelectItem value="1:1" disabled>
                          1:1 (Square – Coming soon)
                        </SelectItem>
                        <SelectItem value="9:16" disabled>
                          9:16 (Vertical – Coming soon)
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                  <p className="text-blue-300 text-sm flex items-start gap-2">
                    <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <span>
                      These advanced settings help fine-tune the creative direction and visual style of your
                      generated content.
                    </span>
                  </p>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>

          {/* RAG Style Examples */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-white mb-1">Need Inspiration?</h3>
                <p className="text-sm text-gray-400">
                  Use structural cues from reference. Try these examples:
                </p>
              </div>
              <Badge
                variant="outline"
                className={`cursor-pointer transition-all ${
                  ragEnabled
                    ? "bg-purple-500/30 text-purple-200 border-purple-500/50"
                    : "bg-purple-500/10 text-purple-400 border-purple-500/20"
                }`}
                onClick={() => onToggleRag(!ragEnabled)}
              >
                RAG {ragEnabled ? "ON" : "OFF"}
              </Badge>
            </div>

            <div className="grid gap-3">
              {EXAMPLE_PROMPTS.map((example) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => handleExampleClick(example)}
                  className="text-left p-4 bg-gradient-to-r from-purple-900/20 to-blue-900/20 hover:from-purple-800/30 hover:to-blue-800/30 border border-purple-500/20 hover:border-purple-400/40 rounded-lg transition-all hover:shadow-lg hover:shadow-purple-500/10 group relative overflow-hidden"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-purple-500/0 via-purple-500/5 to-purple-500/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
                  <div className="flex items-start justify-between gap-3 relative z-10">
                    <p className="text-gray-300 group-hover:text-white">{example}</p>
                    <ChevronRight className="w-5 h-5 text-purple-500 group-hover:text-purple-400 flex-shrink-0 mt-0.5 transition-transform group-hover:translate-x-1" />
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Actions */}
          {canContinue && (
            <div className="flex justify-end mt-6">
              <Button
                type="button"
                onClick={onNext}
                className="group h-12 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 shadow-lg shadow-purple-500/30 hover:shadow-purple-500/50 px-6 flex items-center gap-2"
              >
                Continue to Concept
                <ChevronRight className="w-5 h-5 ml-2 transition-transform group-hover:translate-x-1" />
              </Button>
            </div>
          )}

          {!canContinue && isGenerateDisabled && (
            <p className="text-center text-sm text-gray-500 mt-4">
              Enter an idea or upload a file to continue.
            </p>
          )}
        </Card>
      </div>
    </TooltipProvider>
  );
}

export { IdeaStep };
export default IdeaStep;
