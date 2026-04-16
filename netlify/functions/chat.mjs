export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: { message: 'ANTHROPIC_API_KEY not configured on the server.' } },
      { status: 500 }
    );
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json(
      { error: { message: 'Invalid JSON in request body.' } },
      { status: 400 }
    );
  }

  const { messages, model, max_tokens, system } = body;

  const anthropicBody = {
    model: model || 'claude-sonnet-4-20250514',
    max_tokens: max_tokens || 2048,
    messages: messages
  };
  if (system) {
    anthropicBody.system = system;
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify(anthropicBody)
  });

  if (!response.ok) {
    let errBody = {};
    try { errBody = await response.json(); } catch {}
    const msg = (errBody.error && errBody.error.message) || `HTTP ${response.status}`;
    return Response.json(
      { error: { message: msg } },
      { status: response.status }
    );
  }

  const data = await response.json();
  return Response.json(data);
}

export const config = {
  path: '/api/chat'
};
