const MODEL = 'anthropic/claude-sonnet-4.6';
const MAX_TOKENS_CAP = 2048;
const MAX_BODY_BYTES = 32 * 1024;
const TEMPERATURE = 0.3;

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) {
    return Response.json(
      { error: { message: 'Request body too large.' } },
      { status: 413 }
    );
  }

  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return Response.json(
      { error: { message: 'Invalid JSON in request body.' } },
      { status: 400 }
    );
  }

  const { messages, system } = body;
  if (!Array.isArray(messages) || messages.length === 0) {
    return Response.json(
      { error: { message: 'messages must be a non-empty array.' } },
      { status: 400 }
    );
  }

  const openaiMessages = [];
  if (typeof system === 'string' && system.length > 0) {
    openaiMessages.push({ role: 'system', content: system });
  }
  for (const m of messages) {
    if (!m || typeof m.role !== 'string' || typeof m.content !== 'string') {
      return Response.json(
        { error: { message: 'Each message must have role and content strings.' } },
        { status: 400 }
      );
    }
    openaiMessages.push({ role: m.role, content: m.content });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: { message: 'OPENROUTER_API_KEY not configured on the server.' } },
      { status: 500 }
    );
  }

  let upstream;
  try {
    upstream = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://alpha.gov.bb',
        'X-Title': 'GovTech Barbados Prototype'
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS_CAP,
        temperature: TEMPERATURE,
        messages: openaiMessages
      })
    });
  } catch (e) {
    return Response.json(
      { error: { message: `Upstream request failed: ${e.message}` } },
      { status: 502 }
    );
  }

  if (!upstream.ok) {
    let errBody = {};
    try { errBody = await upstream.json(); } catch {}
    const msg = (errBody.error && errBody.error.message) || `HTTP ${upstream.status}`;
    return Response.json({ error: { message: msg } }, { status: upstream.status });
  }

  const data = await upstream.json();
  const text = data.choices?.[0]?.message?.content || '';

  // Client expects Anthropic-shaped responses; reshape OpenRouter's OpenAI-compatible payload.
  return Response.json({
    content: [{ type: 'text', text }],
    model: data.model,
    role: 'assistant'
  });
}

export const config = {
  path: '/api/chat'
};
