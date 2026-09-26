import { tokenize } from './vector.js';

const aliases = { permission: ['permission', 'authorize', 'authorise', 'consent'], settings: ['settings', 'deeplink'], bluetooth: ['bluetooth'], validate: ['validate', 'validation', 'check'], fallback: ['fallback', 'backup'], input: ['input', 'utterance'] };
const fillers = new Set(['find', 'where', 'which', 'the', 'a', 'an', 'is', 'are', 'does', 'do', 'code', 'function', 'files', 'file', 'call', 'calls', 'tool', 'before', 'after', 'await', 'awaiting', 'wait', 'waiting', 'without', 'for', 'to', 'and', 'or', 'in', 'of', 'version', 'versions', 'stopped', 'stop', 'started', 'start', 'finishes', 'completes', 'completion', 'check', 'checking', 'run', 'runs', 'can']);
export function targetMatches(target, phrase) {
  const exact = phrase.trim();
  if (target === exact || target.split('.').at(-1) === exact) return true;
  const targetTokens = tokenize(target);
  const queryTokens = tokenize(phrase).filter(t => !fillers.has(t));
  if (!queryTokens.length) return false;
  return queryTokens.every(t => targetTokens.includes(t) || (aliases[t] ?? []).some(x => targetTokens.includes(x)));
}

export function planQuery(query) {
  if (typeof query !== 'string' || !query.trim()) throw new Error('Query must be non-empty text');
  if (query.length > 2000) throw new Error('Query is limited to 2000 characters');
  const text = query.replace(/[`"']/g, '').trim();
  const constraints = [];
  const negativeAwait = text.match(/(?:without\s+(?:awaiting|waiting\s+for)|(?:does\s+not|doesn't|stopped|stop|no\s+longer)\s+(?:awaiting|waiting\s+for)|unawaited)\s+(.+?)(?:[?.]|$)/i);
  const finishes = text.match(/before\s+(.+?)\s+(?:finishes|completes|has\s+finished)/i);
  if (negativeAwait || finishes) constraints.push({ kind: 'await', target: (negativeAwait?.[1] ?? finishes[1]).trim(), expected: false });
  else {
    const positive = text.match(/(?:awaits?|waits?\s+for|waiting\s+for)\s+(.+?)(?:\s+before\s+|[?.]|$)/i);
    if (positive) constraints.push({ kind: 'await', target: positive[1].trim(), expected: true });
  }
  const order = text.match(/(?:calls?|invokes?|executes?)\s+(?:tool\s+)?([\w.$]+)\s+before\s+(?:calling\s+)?(?:tool\s+)?([\w.$]+)/i);
  if (order && !finishes) constraints.push({ kind: 'order', first: order[1], second: order[2] });
  const guard = text.match(/(?:without\s+(?:a\s+)?(?:guard|checking)|(?:removed|lost)\s+(?:the\s+)?guard)(?:\s+(?:for|on|of))?\s+(.+?)(?:[?.]|$)/i);
  if (guard) constraints.push({ kind: 'guard', target: guard[1].trim(), expected: false });
  const positiveGuard = text.match(/(?:guarded\s+by|checks?\s+the\s+guard)\s+(.+?)(?:[?.]|$)/i);
  if (positiveGuard) constraints.push({ kind: 'guard', target: positiveGuard[1].trim(), expected: true });
  const evolutionary = /\b(removed|added|changed|stop|stopped|started|restored|no longer|regression|first version|lost)\b/i.test(text);
  return { query: text, intent: evolutionary ? 'evolutionary' : constraints.length ? 'structural' : 'semantic', constraints,
    terms: tokenize(text), limitations: ['Static evidence describes supported syntax; it does not establish runtime completion or branch feasibility.'] };
}

export function inspectConstraints(snippet, plan, history) {
  const results = [];
  for (const constraint of plan.constraints) {
    let status = 'unknown', lines = [], details = '';
    if (constraint.kind === 'await') {
      const calls = snippet.facts.calls.filter(c => targetMatches(c.target, constraint.target));
      lines = calls.map(c => c.line);
      if (calls.length) {
        const matches = calls.filter(c => c.awaited === constraint.expected && !c.uncertain);
        status = matches.length ? 'supported' : calls.every(c => !c.uncertain) ? 'contradicted' : 'unknown';
        details = constraint.expected ? 'Direct invocation is awaited' : 'Direct invocation is not awaited; completion is not established';
        if (plan.intent === 'evolutionary') {
          const kind = constraint.expected ? 'added_await' : 'removed_await';
          const changed = history.changes.some(c => c.type === kind && targetMatches(c.target, constraint.target));
          const repeated = calls.length > 1;
          status = history.previousVersion ? changed ? status : repeated ? 'unknown' : 'contradicted' : 'unknown';
          details = `${kind} relative to ${history.previousVersion ?? 'unavailable predecessor'}`;
        }
      }
    }
    if (constraint.kind === 'order') {
      const first = snippet.facts.calls.filter(c => targetMatches(c.target, constraint.first));
      const second = snippet.facts.calls.filter(c => targetMatches(c.target, constraint.second));
      const pair = first.flatMap(a => second.map(b => [a, b])).find(([a, b]) => snippet.facts.calls.indexOf(a) < snippet.facts.calls.indexOf(b));
      lines = pair?.map(c => c.line) ?? [...first, ...second].map(c => c.line);
      if (first.length && second.length && snippet.facts.linear && !snippet.facts.uncertain) status = pair ? 'supported' : 'contradicted';
      details = 'Invocation order only; certificate requires a straight-line function';
    }
    if (constraint.kind === 'guard') {
      const guards = snippet.facts.guards.filter(g => targetMatches(g.condition, constraint.target));
      lines = guards.map(g => g.line);
      if (constraint.expected && guards.length) status = 'supported';
      if (!constraint.expected && snippet.facts.linear && !snippet.facts.uncertain) status = 'supported';
      if (!constraint.expected && guards.length) status = 'contradicted';
      if (plan.intent === 'evolutionary' && !constraint.expected) {
        status = history.previousVersion ? history.changes.some(c => c.type === 'removed_guard' && targetMatches(c.condition, constraint.target)) ? 'supported' : 'contradicted' : 'unknown';
      }
      details = 'Guard syntax within this function; no interprocedural dominance claim';
    }
    results.push({ ...constraint, status, lines, details });
  }
  return results;
}
