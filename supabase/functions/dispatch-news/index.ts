// Supabase Edge Function: news_submissions → GitHub repository_dispatch.
// Secret required: GITHUB_PAT (classic `repo` scope as user slabslip).
// Wire via Dashboard → Database → Webhooks → this function (Insert + Update).

const OWNER_REPO = "slabslip/cuckle-trade-tracker";
const EVENT_TYPE = "news-submission";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }

  const pat = Deno.env.get("GITHUB_PAT");
  if (!pat) {
    return new Response(JSON.stringify({ ok: false, error: "GITHUB_PAT secret missing" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  let payload: Record<string, unknown> = {};
  try {
    payload = await req.json();
  } catch {
    payload = {};
  }

  const record = (payload.record || payload) as Record<string, unknown>;
  const res = await fetch(`https://api.github.com/repos/${OWNER_REPO}/dispatches`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${pat}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      "User-Agent": "cuckle-news-dispatch",
    },
    body: JSON.stringify({
      event_type: EVENT_TYPE,
      client_payload: {
        id: record.id ?? null,
        op: payload.type ?? "webhook",
        source: "supabase-edge",
      },
    }),
  });

  const body = await res.text();
  return new Response(
    JSON.stringify({ ok: res.status === 204, github_status: res.status, body: body || null }),
    {
      status: res.status === 204 ? 200 : 502,
      headers: { "Content-Type": "application/json" },
    },
  );
});
