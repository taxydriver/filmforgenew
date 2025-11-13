// src/components/WorkflowSteps.tsx
import { Lightbulb, FileText, Film, Video, UserSquare2 } from "lucide-react";
import { Progress } from "./ui/progress";
import type { Step, ProjectData } from "@/App";

type WorkflowStepsProps = {
  currentStep: Step;
  projectData: ProjectData;
  onStepClick: (step: Step) => void;
};

const STEPS: Array<{ id: Step; label: string; icon: typeof Lightbulb }> = [
  { id: "idea", label: "Idea", icon: Lightbulb },
  { id: "concept", label: "Concept", icon: FileText },
  { id: "screenplay", label: "Screenplay", icon: Film },
  { id: "storychars", label: "Storyboard", icon: UserSquare2 },
  { id: "trailer", label: "Trailer", icon: Video },
];

function WorkflowSteps({ currentStep, projectData, onStepClick }: WorkflowStepsProps) {
  const currentIndex = STEPS.findIndex((step) => step.id === currentStep);

  const isStepCompleted = (stepId: Step) => {
    const stepIndex = STEPS.findIndex((step) => step.id === stepId);
    if (stepIndex < currentIndex) return true;
    if (stepId === "idea") return !!projectData.idea;
    if (stepId === "concept") return !!projectData.concept;
    if (stepId === "screenplay") return !!projectData.screenplay;
    if (stepId === "storychars") return !!projectData.storychars;
    if (stepId === "trailer") return !!projectData.trailer;
    return false;
  };

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-4">
        {STEPS.map((step, index) => {
          const Icon = step.icon;
          const isActive = currentStep === step.id;
          const isCompleted = isStepCompleted(step.id);
          const canClick = index <= currentIndex || isCompleted;

          return (
            <div key={step.id} className="flex items-center flex-1">
  {/* make the icon+label a bounded column so it doesn't eat connector space */}
              <div className="flex flex-col items-center shrink-0 w-36 md:w-40">
   
                <button
                  type="button"
                  onClick={() => canClick && onStepClick(step.id)}
                  disabled={!canClick}
                  className={`w-12 h-12 rounded-full flex items-center justify-center transition-all relative ${
                    isActive
                      ? "bg-gradient-to-br from-purple-500 to-blue-500 text-white shadow-lg shadow-purple-500/50 scale-110"
                      : isCompleted
                      ? "bg-gradient-to-br from-green-500 to-emerald-500 text-white shadow-lg shadow-green-500/30"
                      : "bg-white/5 text-gray-500 border border-white/10"
                  } ${canClick ? "cursor-pointer hover:scale-105" : "cursor-not-allowed"}`}
                >
                  {isActive && (
                    <div className="absolute inset-0 rounded-full bg-purple-500 animate-ping opacity-20" />
                  )}
                  <Icon className="w-5 h-5 relative z-10" />
                </button>
                <span
                  className={`mt-2 text-sm ${
                    isActive ? "text-purple-400" : isCompleted ? "text-green-400" : "text-gray-600"
                  }`}
                >
                  {step.label}
                </span>
              </div>

              {index < STEPS.length - 1 && (
                <div
                  className={`flex-1 h-1 mx-4 rounded relative overflow-hidden ${
                    isCompleted
                      ? "bg-gradient-to-r from-green-500 to-emerald-500 shadow-lg shadow-green-500/20"
                      : "bg-white/10"
                  }`}
                >
                  {isCompleted && (
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-pulse" />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="relative">
        <Progress
          value={((currentIndex + 1) / STEPS.length) * 100}
          className="h-2 bg-white/10"
        />
        <div
          className="absolute inset-0 h-2 bg-gradient-to-r from-purple-500 to-blue-500 rounded-full opacity-50 blur-sm"
          style={{ width: `${((currentIndex + 1) / STEPS.length) * 100}%` }}
        />
      </div>
    </div>
  );
}

export { WorkflowSteps };
