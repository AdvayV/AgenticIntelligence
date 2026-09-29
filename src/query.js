import { tokenize } from './vector.js';

const aliases = { permission: ['permission', 'authorize', 'authorise', 'consent'], settings: ['settings', 'deeplink'], bluetooth: ['bluetooth'], validate: ['validate', 'validation', 'check'], fallback: ['fallback', 'backup'], input: ['input', 'utterance'] };
const fillers = new Set(['find', 'where', 'which', 'the', 'a', 'an', 'is', 'are', 'does', 'do', 'code', 'function', 'files', 'file', 'call', 'calls', 'tool', 'before', 'after', 'await', 'awaiting', 'wait', 'waiting', 'without', 'for', 'to', 'and', 'or', 'in', 'of', 'version', 'versions', 'stopped', 'stop', 'started', 'start', 'finishes', 'completes', 'completion', 'check', 'checking', 'run', 'runs', 'can']);
export function targetMatches(target, phrase) {
  const exact = phrase.trim();
  if (target.toLowerCase() === exact.toLowerCase() || target.split('.').at(-1).toLowerCase() === exact.toLowerCase()) return true;
  const targetTokens = tokenize(target);
  const queryTokens = tokenize(phrase).filter(t => !fillers.has(t));
  if (!queryTokens.length) return false;
  return queryTokens.every(t => targetTokens.includes(t) || (Object.hasOwn(aliases, t) ? aliases[t] : []).some(x => targetTokens.includes(x)));
}

export function planQuery(query) {
  if (typeof query !== 'string' || !query.trim()) throw new Error('Query must be non-empty text');
  if (query.length > 2000) throw new Error('Query is limited to 2000 characters');
  const text = query.replace(/[`"']/g, '').replace(/\(\s*\)/g, '').trim();
  const constraints = [];
  const cleanTarget = value => value.replace(/\s+(?:and|but|before|after)\s+.*$/i, '').trim();
  const negativeAwait = text.match(/(?:without\s+(?:awaiting|waiting\s+for)|(?:does\s+not|doesnt|stopped|stop|no\s+longer)\s+(?:awaits?|awaiting|waits?\s+for|waiting\s+for)|removed\s+(?:the\s+)?await\s+(?:from|on|for)|unawaited)\s+(.+?)(?:[?]|$)/i);
  const finishes = text.match(/before\s+(.+?)\s+(?:finishes|completes|completed|has\s+finished)/i);
  if (negativeAwait || finishes) constraints.push({ kind: 'await', target: cleanTarget(negativeAwait?.[1] ?? finishes[1]).replace(/\.$/, ''), expected: false });
  else {
    const positive = text.match(/(?:awaits?|awaiting|waits?\s+for|waiting\s+for|restored\s+(?:the\s+)?await\s+(?:on|for))\s+(.+?)(?:[?]|$)/i);
    if (positive) constraints.push({ kind: 'await', target: cleanTarget(positive[1]).replace(/\.$/, ''), expected: true });
  }
  const order = text.match(/(?:calls?|invokes?|executes?|runs?)\s+(?:tool\s+)?([\w.$]+)\s+(?:before|prior\s+to|then)\s+(?:(?:calling|invoking|executing)\s+)?(?:tool\s+)?([\w.$]+)/i)
    ?? text.match(/\b([\w.$]+)\s+(?:then|precedes)\s+([\w.$]+)/i);
  if (order && !finishes) constraints.push({ kind: 'order', first: order[1], second: order[2] });
  const after = !order && (text.match(/(?:calls?|invokes?|executes?|runs?)\s+(?:tool\s+)?([\w.$]+)\s+after\s+(?:(?:calling|invoking|executing)\s+)?(?:tool\s+)?([\w.$]+)/i) ?? text.match(/\b([\w.$]+)\s+after\s+([\w.$]+)/i));
  if (after) constraints.push({ kind: 'order', first: after[2], second: after[1] });
  const guard = text.match(/(?:without\s+(?:a\s+)?(?:guard|checking)|(?:removed|lost)\s+(?:the\s+)?guard)(?:\s+(?:for|on|of))?\s+(.+?)(?:[?]|$)/i);
  if (guard) constraints.push({ kind: 'guard', target: cleanTarget(guard[1]).replace(/\.$/, ''), expected: false });
  const positiveGuard = text.match(/(?:guarded\s+by|checks?\s+the\s+guard)\s+(.+?)(?:[?]|$)/i);
  if (positiveGuard) constraints.push({ kind: 'guard', target: cleanTarget(positiveGuard[1]).replace(/\.$/, ''), expected: true });
  const literal = text.match(/\b[a-z][a-z0-9+.-]*:\/\/[a-z0-9/_#=:%+.-]+(?:\?[a-z0-9_=&%+.-]+)?/i);
  if (literal) constraints.push({ kind: 'literal', value: literal[0].replace(/\.$/, '') });
  const evolutionary = /\b(removed|added|changed|stop|stopped|started|restored|no longer|regression|first version|lost)\b/i.test(text);
  const limitations = ['Static evidence describes supported syntax; it does not establish runtime completion or branch feasibility.'];
  if (!constraints.length && /\b(before|after|without|guard|await|changed|regression)\b/i.test(text)) limitations.push('This phrasing did not produce a supported structural constraint; results use relevance ranking.');
  return { query: text, intent: evolutionary ? 'evolutionary' : constraints.length ? 'structural' : 'semantic', constraints,
    terms: tokenize(text), planner: 'local-constraint-parser', limitations };
}

export function inspectConstraints(snippet, plan, history) {
  const results = [];
  for (const constraint of plan.constraints) {
    let status = 'unknown', lines = [], details = '';
    if (constraint.kind === 'literal') {
      const found = snippet.facts.literals?.filter(item => item.value === constraint.value) ?? [];
      lines = found.map(item => item.line);
      status = found.length ? 'supported' : snippet.facts.literals ? 'contradicted' : 'unknown';
      details = found.length ? 'Exact literal: ' + constraint.value : 'No exact literal in this function scope: ' + constraint.value;
    }
    if (constraint.kind === 'await') {
      const calls = snippet.facts.calls.filter(c => targetMatches(c.target, constraint.target));
      lines = calls.map(c => c.line);
      if (calls.length) {
        const matches = calls.filter(c => c.awaited === constraint.expected && !c.uncertain);
        status = matches.length ? 'supported' : calls.every(c => !c.uncertain) ? 'contradicted' : 'unknown';
        details = status === 'unknown' ? 'Await relationship needs inspection' : matches.length ? constraint.expected ? 'Direct invocation is awaited' : 'Direct invocation is not awaited; completion is not established' : constraint.expected ? 'No matching direct invocation is awaited' : 'Every matching direct invocation is awaited';
        if (plan.intent === 'evolutionary') {
          const kind = constraint.expected ? 'added_await' : 'removed_await';
          const changed = history.changes.some(c => c.type === kind && targetMatches(c.target, constraint.target));
          const repeated = calls.length > 1;
          status = history.previousVersion ? changed ? status : repeated ? 'unknown' : 'contradicted' : 'unknown';
          details = changed ? `${kind === 'added_await' ? 'Await added' : 'Await removed'} relative to ${history.previousVersion}` : history.previousVersion ? `No unambiguous ${kind.replace('_', ' ')} relative to ${history.previousVersion}` : 'Predecessor is unavailable or ambiguous';
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
