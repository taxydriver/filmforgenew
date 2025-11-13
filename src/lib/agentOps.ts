export type AgentOp =
  | { action: "append"; text: string }
  | { action: "prepend"; text: string }
  | { action: "replace_all"; text: string }
  | { action: "insert_after"; anchor: string; text: string }
  | { action: "insert_before"; anchor: string; text: string }
  | { action: "replace_first"; find: string; text: string }
  | { action: "replace_regex"; pattern: string; flags?: string; text: string };

export type AgentOpsPayload = { target: "screenplay"; ops: AgentOp[] };

export function applyOps(source: string, payload: AgentOpsPayload): string {
  if (payload.target !== "screenplay") return source;
  let t = source ?? "";
  for (const op of payload.ops) {
    try {
      switch (op.action) {
        case "append": t += (t.endsWith("\n") ? "" : "\n") + op.text; break;
        case "prepend": t = op.text + (op.text.endsWith("\n") ? "" : "\n") + t; break;
        case "replace_all": t = op.text; break;
        case "insert_after": {
          const i = t.indexOf(op.anchor);
          if (i >= 0) {
            const j = i + op.anchor.length;
            t = t.slice(0, j) + (op.text.startsWith("\n") ? "" : "\n") + op.text + t.slice(j);
          }
          break;
        }
        case "insert_before": {
          const i = t.indexOf(op.anchor);
          if (i >= 0) t = t.slice(0, i) + op.text + (op.text.endsWith("\n") ? "" : "\n") + t.slice(i);
          break;
        }
        case "replace_first": {
          const i = t.indexOf(op.find);
          if (i >= 0) t = t.slice(0, i) + op.text + t.slice(i + op.find.length);
          break;
        }
        case "replace_regex": {
          const re = new RegExp(op.pattern, op.flags ?? "");
          t = t.replace(re, op.text);
          break;
        }
      }
    } catch { /* ignore a bad op, keep going */ }
  }
  return t;
}