'use strict';
/**
 * In-memory session store keyed by Twilio CallSid.
 * Each phone call gets its own session that persists across webhook requests.
 */

const sessions = new Map();
const TTL_MS   = 30 * 60 * 1000; // 30 minutes

// Clean up stale sessions every 10 minutes
setInterval(() => {
  const cutoff = Date.now() - TTL_MS;
  for (const [sid, s] of sessions) {
    if (s.createdAt < cutoff) sessions.delete(sid);
  }
}, 10 * 60 * 1000).unref(); // .unref() so the interval doesn't keep the process alive

function create(callSid) {
  const session = {
    phase:            'routing',  // routing | chat | complete
    form:             null,       // { id, name, ref, agency }
    messages:         [],         // [{role, content}] — same shape as web chat
    formData:         null,       // extracted JSON after ##COMPLETE##
    routingAttempts:  0,
    turnCount:        0,
    createdAt:        Date.now(),
  };
  sessions.set(callSid, session);
  return session;
}

function get(callSid) {
  return sessions.get(callSid) || null;
}

function remove(callSid) {
  sessions.delete(callSid);
}

module.exports = { create, get, remove };
