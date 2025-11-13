// /lib/autoforge.ts
import { conceptPrompts, screenplayPrompts } from "@/prompts";
import { generateWithModel } from "@/lib/generateWithModel";
import type { ModelProvider } from "@/types/model";
import type { StoryboardCharactersPayload } from "@/components/StoryboardCharactersStep";
import { planShotsFromScreenplay } from "@/lib/trailer";
 
export async function generateConceptStep(params: {
  idea: string;
  provider: ModelProvider;
}): Promise<string> {
  const { idea, provider } = params;
  const system = conceptPrompts.system;
  const prompt = conceptPrompts.buildUserPrompt(idea);
  const text = await generateWithModel({ provider, prompt, system });
  return (text || "").trim();
}

export async function generateScreenplayStep(params: {
  concept: string;
  provider: ModelProvider;
}): Promise<string> {
  const { concept, provider } = params;
  const system = screenplayPrompts.system;
  const prompt = screenplayPrompts.buildUserPrompt(concept);
  const text = await generateWithModel({ provider, prompt, system });
  return (text || "").trim();
}

/**
 * Trailer generation is often handled by your backend (stitching images/videos + audio).
 * This wrapper calls your API. Adjust the endpoint/payload if yours differs.
 */
export async function generateTrailerStep(params: {
  screenplay: string;
  provider: ModelProvider;
  storychars?: StoryboardCharactersPayload | null;
}): Promise<{ videoUrl: string; description: string }> {
  const { screenplay, provider, storychars = null } = params;

  const storyboardShots =
    storychars?.shots && storychars.shots.length
      ? storychars.shots.map((s) => ({
          id: s.id,
          prompt: s.prompt,
          negative: s.negative ?? "",
        }))
      : (await planShotsFromScreenplay(screenplay, 4, provider)).shots;

  const summary =
    storyboardShots
      .map(
        (shot, idx) =>
          `SHOT ${idx + 1}: ${shot.prompt}${shot.negative ? `\nNEG: ${shot.negative}` : ""}`
      )
      .join("\n\n") || "Trailer plan generated.";

  return {
    videoUrl: "about:blank",
    description: summary,
  };
}
