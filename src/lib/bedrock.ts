import { BedrockRuntimeClient, ConverseStreamCommand, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";

export function getClient(){
  const region = process.env.BEDROCK_REGION || process.env.AWS_REGION || "ap-southeast-2";
  return new BedrockRuntimeClient({ region });
}

export async function streamClaude({ modelId, system, user, temperature=0.7 }:{ modelId:string; system:string; user:string; temperature?:number; }){
  const client = getClient();
  const cmd = new ConverseStreamCommand({
    modelId,
    inferenceConfig: { temperature },
    system: [{ text: system }],
    messages: [{ role: "user", content: [{ text: user }] }]
  } as any);
  return client.send(cmd);
}

export async function chatOnce({ modelId, system, user, temperature=0.7 }:{ modelId:string; system:string; user:string; temperature?:number; }){
  const client = getClient();
  const cmd = new ConverseCommand({
    modelId,
    inferenceConfig: { temperature },
    system: [{ text: system }],
    messages: [{ role: "user", content: [{ text: user }] }]
  } as any);
  const res = await client.send(cmd);
  return res?.output?.message?.content?.[0]?.text || "";
}
