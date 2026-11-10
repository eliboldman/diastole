import { z } from "zod";

import { askDiastole } from "@/lib/ai/ask";
import { createClient, getProfile } from "@/lib/supabase/server";

// Ask Diastole: streams newline-delimited JSON. {t:"step",text} while it looks things up, then
// {t:"answer",text,cost} or {t:"error",text}.

export const maxDuration = 120;

const Body = z.object({
  question: z.string().trim().min(1).max(2000),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(8000) })).max(40).default([]),
});

export async function POST(request: Request) {
  const me = await getProfile();
  if (!me) return new Response("Sign in first.", { status: 401 });
  if (me.role !== "coach") return new Response("Coaches only.", { status: 403 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return new Response("Bad request.", { status: 400 });
  const supabase = await createClient();

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (o: object) => controller.enqueue(enc.encode(`${JSON.stringify(o)}\n`));
      const r = await askDiastole({
        supabase,
        coach: { id: me.id, units: me.units },
        history: parsed.data.history,
        question: parsed.data.question,
        onStep: (text) => send({ t: "step", text }),
      });
      send(r.ok ? { t: "answer", text: r.text, cost: r.costUsd } : { t: "error", text: r.error });
      controller.close();
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
}
