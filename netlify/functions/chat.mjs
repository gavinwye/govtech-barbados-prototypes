const USE_GROQ = !process.env.ANTHROPIC_API_KEY && !!process.env.GROQ_API_KEY;

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.GROQ_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: { message: 'No API key configured (ANTHROPIC_API_KEY or GROQ_API_KEY).' } },
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

  let response;

  if (USE_GROQ) {
    // Groq uses OpenAI-compatible format
    const groqMessages = [];
    if (system) groqMessages.push({ role: 'system', content: system });
    groqMessages.push(...messages);

    response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: max_tokens || 2048,
        messages: groqMessages,
      }),
    });

    if (!response.ok) {
      let errBody = {};
      try { errBody = await response.json(); } catch {}
      const msg = (errBody.error && errBody.error.message) || `HTTP ${response.status}`;
      return Response.json({ error: { message: msg } }, { status: response.status });
    }

    // Convert Groq/OpenAI response to Anthropic format (chat-interface.html expects it)
    const groqData = await response.json();
    const text = groqData.choices?.[0]?.message?.content || '';
    return Response.json({
      content: [{ type: 'text', text }],
      model: groqData.model,
      role: 'assistant',
    });
  }

  // Anthropic path
  const anthropicBody = {
    model: model || 'claude-sonnet-4-20250514',
    max_tokens: max_tokens || 2048,
    messages: messages
  };
  if (system) {
    anthropicBody.system = system;
  }

  response = await fetch('https://api.anthropic.com/v1/messages', {
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
