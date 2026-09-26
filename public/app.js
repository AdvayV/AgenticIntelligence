const $ = id => document.getElementById(id);
const make = (tag, text, className) => {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
};
const HELP = {
  query: { title: 'Search for a behavior, not just a name.', body: 'A function name can stay the same while its behavior changes. Describe the relationship you need: a missing await, a removed guard, or one call before another.', example: '“Where did Bluetooth settings stop waiting for permission checking?”' },
  version: { title: 'The right code. In the right version.', body: 'Nearly identical versions can behave differently. Choose a snapshot to narrow the returned results, or search the full history. Predecessor evidence can still come from an earlier version.', example: 'Choose v2 to see the snapshot where the permission await was removed.' },
  mode: { title: 'Three ways to look at the same code.', body: 'Behavior + evidence checks requested patterns and historical changes. Hybrid combines keyword and vector rankings. Lexical uses keyword ranking. Switch lenses to inspect the difference.', example: 'Compare the same call-order query across lenses. The baseline does not check structural constraints.' },
  order: { title: 'The same calls can tell a different story.', body: 'Finding two tool names is not enough to establish their order. We inspect invocation order and only support it in a straight-line function.', example: '“Find calls validateInput before executeTool.” Calls on opposite branches remain uncertain.' },
  guard: { title: 'Find the condition that disappeared.', body: 'A guard controls whether an action is reached. Historical comparison can retrieve the function version where that condition was removed, even when the action and function name stayed the same.', example: 'In v2, launchDevice no longer contains the device.supported condition.' },
  await: { title: 'One keyword can change the waiting behavior.', body: 'A direct await waits for an operation before proceeding. Its removal is useful retrieval evidence. A missing direct await does not establish a runtime race or prove the function never waits elsewhere.', example: 'Promises awaited through variables and awaited combinators stay uncertain.' },
  usage: { title: 'Sometimes the exact string is the clue.', body: 'Deeplinks, tool names, and literals often carry information that a broad similarity search can miss. The keyword signal preserves those exact clues.', example: 'Search settings://device to find the snippets that use that deeplink.' },
  evidence: { title: 'A relevant snippet needs supporting evidence.', body: 'A supported pattern satisfies every requested constraint using the analyzer’s supported syntax. Related code may be relevant by ranking alone. Uncertain or contradicted results are labeled explicitly.', example: 'The count covers supported patterns among the displayed results, not the entire repository.' },
  supported: { title: 'Supported by the code we can inspect.', body: 'The requested static patterns are supported by the available syntax and version evidence. This is narrower than a proof that the behavior happens at runtime.', example: 'Highlighted lines point to the evidence for the requested relationship.' },
  uncertain: { title: 'Uncertainty is useful information.', body: 'The required evidence may be missing, or the path may use control flow the analyzer cannot resolve. We keep the snippet inspectable without certifying the relationship.', example: 'Two calls on mutually exclusive branches do not establish a shared execution order.' },
  contradicted: { title: 'Similar code can be the wrong match.', body: 'At least one requested constraint conflicts with the available evidence. This distinction helps separate almost-identical snippets that implement different behavior.', example: 'A version that awaits permission contradicts a query asking for its removed await.' },
  semantic: { title: 'Related by ranking, without a certificate.', body: 'This result was ranked by keywords and vectors, or no structural constraint was requested. A semantic match does not certify call order, guards, or waiting behavior.', example: 'Use the behavior lens with a supported structural query to inspect stronger evidence.' },
  lines: { title: 'Go directly to the lines that matter.', body: 'Source locations belong to this result’s own snapshot. Highlighted lines identify the calls or conditions used as evidence; they are not a full execution trace.', example: 'A version-specific line location stays correct even when earlier lines were added or removed.' },
  history: { title: 'See the neighboring version, not just the diff.', body: 'The preceding indexed version helps distinguish an existing pattern from a new change. Expand the comparison to inspect the original code and its exact location.', example: 'Symbol matching currently uses the same file, function name, and ordinal. Refactors can require manual inspection.' },
  signals: { title: 'Why did this snippet rank here?', body: 'Keyword and vector signals retrieve candidates. In the behavior lens, supported constraints raise a candidate and contradictions lower it. The numbers are ranking signals, not probability estimates.', example: 'The offline vector baseline uses deterministic feature hashing, not trained semantic embeddings.' },
  latency: { title: 'Fast retrieval keeps exploration moving.', body: 'This is the measured time inside the search engine for the current query. It excludes browser rendering and network time. It is an observation, not a promised response time.', example: 'Try a different lens or version and compare the measured query time.' },
  inspected: { title: 'Search broadly. Inspect selectively.', body: 'The agent inspects a bounded candidate set and expands it when evidence is insufficient. This number counts inspected candidates; initial scoring can still scan the indexed corpus.', example: 'A stop can mean enough supported results, exhausted candidates, or a reached budget.' },
  agent: { title: 'Every search has a visible decision trail.', body: 'The local policy retrieves candidates, checks evidence, and decides whether to expand version relatives or stop. These are recorded search decisions, not invented reasoning.', example: 'A semantic query can stop after ranking. A harder structural query may trigger refinement.' },
  boundary: { title: 'Static patterns are not runtime proofs.', body: 'JavaScript can use dynamic dispatch, asynchronous callbacks, and complex branches. The prototype avoids certainty beyond the syntax it supports.', example: 'An unawaited call is not enough to claim that a permission race actually happens.' },
  corpus: { title: 'A small corpus that exposes subtle differences.', body: 'The default demo contains three synthetic versions of a JavaScript assistant, including controlled regressions and restorations. These examples demonstrate behavior discrimination.', example: 'Demo results are not official benchmark scores or evidence of generalization to every repository.' },
  motion: { title: 'Motion adds context. You stay in control.', body: 'The floating layers represent related code versions. Pause motion for a quieter workspace. Your preference stays in this browser; reduced-motion system preferences are respected.', example: 'Animations illustrate history. They do not represent background indexing or live execution.' },
  illustration: { title: 'The same function, viewed through time.', body: 'These illustrative layers show await present in v1, missing in v2, and restored in v3. A small textual difference can matter more than a large similarity score.', example: 'Run the Bluetooth query to retrieve the actual version and inspect its predecessor.' },
};
let lastHelp = '';
function showHelp(element) {
  const key = element?.dataset.help, help = HELP[key];
  if (!help) return;
  const identity = key + (element.dataset.detail ?? '');
  if (lastHelp === identity) return;
  lastHelp = identity;
  $('help-title').textContent = help.title;
  $('help-body').textContent = help.body;
  $('help-example-label').textContent = element.dataset.detail ? 'IN THIS RESULT' : 'EXAMPLE';
  $('help-example').textContent = element.dataset.detail ?? help.example;
  $('help-panel').classList.add('is-contextual');
  $('help-content').classList.remove('context-enter');
  // Force a fresh entrance only when the explained concept actually changes.
  void $('help-content').offsetWidth;
  $('help-content').classList.add('context-enter');
}
for (const eventName of ['pointerover', 'focusin', 'click']) document.addEventListener(eventName, event => {
  if (event.target instanceof Element) showHelp(event.target.closest('[data-help]'));
});

const motionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)');
let motionPaused = false;
try { motionPaused = localStorage.getItem('codestrata-motion') === 'paused'; } catch { /* Private storage may be unavailable. */ }
function updateMotion() {
  const reduced = Boolean(motionQuery?.matches);
  document.body.classList.toggle('motion-paused', motionPaused || reduced);
  $('motion-toggle').setAttribute('aria-pressed', String(motionPaused || reduced));
  $('motion-toggle').disabled = reduced;
  $('motion-label').textContent = reduced ? 'Motion reduced' : motionPaused ? 'Resume motion' : 'Pause motion';
  $('motion-toggle').setAttribute('aria-label', reduced ? 'Motion reduced by system preference' : motionPaused ? 'Resume animations' : 'Pause animations');
  document.querySelector('.motion-symbol').textContent = motionPaused || reduced ? '▷' : 'Ⅱ';
}
updateMotion();
motionQuery?.addEventListener?.('change', updateMotion);
$('motion-toggle').addEventListener('click', () => {
  motionPaused = !motionPaused;
  try { localStorage.setItem('codestrata-motion', motionPaused ? 'paused' : 'running'); } catch { /* Motion remains controllable without storage. */ }
  updateMotion();
});

function appendHighlightedText(element, text) {
  const tokens = /(\/\/.*$|'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|\b(?:async|await|function|return|const|let|var|if|else|new|throw|true|false|null|export)\b|\b\d+(?:\.\d+)?\b|\b[A-Za-z_$][\w$]*(?=\s*\())/g;
  let offset = 0;
  for (const match of text.matchAll(tokens)) {
    element.append(document.createTextNode(text.slice(offset, match.index)));
    const token = match[0];
    const kind = token.startsWith('//') ? 'comment' : /^['"]/.test(token) ? 'string' : /^\d/.test(token) ? 'number' : /^(async|await|function|return|const|let|var|if|else|new|throw|true|false|null|export)$/.test(token) ? 'keyword' : 'function';
    element.append(make('span', token, 'token-' + kind));
    offset = match.index + token.length;
  }
  element.append(document.createTextNode(text.slice(offset)));
}
function codeView(code, startLine, markedLines = new Set(), location = '') {
  const container = make('div', undefined, 'code-container'), pre = make('pre', undefined, 'code-block');
  pre.dataset.help = 'lines';
  pre.dataset.detail = location;
  code.split('\n').forEach((line, i) => {
    const number = startLine + i, highlighted = markedLines.has(number);
    const row = make('span', undefined, 'code-line' + (highlighted ? ' hit' : ''));
    row.append(make('span', String(number), 'line-number'));
    appendHighlightedText(row, line);
    if (highlighted) {
      row.tabIndex = 0;
      row.dataset.help = 'lines';
      row.dataset.detail = location + ' · evidence on line ' + number;
      row.setAttribute('aria-label', 'Evidence on line ' + number + ': ' + line.trim());
    }
    pre.append(row);
  });
  container.append(pre);
  return container;
}
const certaintyLabels = {
  'supported-static-pattern': ['✓', 'Pattern supported', '', 'supported'],
  uncertain: ['◌', 'Needs inspection', 'uncertain', 'uncertain'],
  contradicted: ['!', 'Contradiction', 'uncertain', 'contradicted'],
  'semantic-match': ['◎', 'Related code', 'semantic', 'semantic'],
};
function resultCard(result) {
  const card = make('article', undefined, 'result-card');
  const header = make('div', undefined, 'card-head'), metadata = make('div');
  const location = result.file + ':' + result.startLine + '–' + result.endLine;
  metadata.append(make('h3', result.name, 'card-title'));
  const path = make('div', undefined, 'location');
  path.append(make('span', location), make('span', '·'), make('span', result.version, 'version-tag'));
  metadata.append(path);
  const [symbol, label, className, help] = certaintyLabels[result.certainty] ?? certaintyLabels.uncertain;
  const badge = make('button', symbol + ' ' + label, 'certainty-badge ' + className);
  badge.type = 'button'; badge.dataset.help = help;
  badge.dataset.detail = result.name + ' @ ' + result.version + ' · ' + label;
  badge.setAttribute('aria-label', 'Explain: ' + label);
  badge.setAttribute('aria-controls', 'help-panel');
  header.append(make('span', String(result.rank).padStart(2, '0'), 'rank-marker'), metadata, badge);
  card.append(header, codeView(result.code, result.startLine, new Set(result.evidence.flatMap(e => e.lines)), location));
  const footer = make('div', undefined, 'evidence-footer');
  for (const item of result.evidence) {
    const row = make('div', undefined, 'evidence-row ' + item.status);
    row.dataset.help = item.status === 'supported' ? 'supported' : item.status === 'contradicted' ? 'contradicted' : 'uncertain';
    row.append(make('span', item.status === 'supported' ? '✓' : item.status === 'contradicted' ? '!' : '◌', 'evidence-icon'), make('span', item.details));
    footer.append(row);
  }
  if (!result.evidence.length) {
    const row = make('div', undefined, 'evidence-row');
    row.dataset.help = 'semantic';
    row.append(make('span', '◎', 'evidence-icon'), make('span', 'Ranked by relevance. No structural certificate requested.'));
    footer.append(row);
  }
  const history = result.history;
  if (history.previousVersion) {
    const strip = make('div', undefined, 'history-strip');
    strip.dataset.help = 'history';
    strip.append(make('span', history.previousVersion + ' → ' + result.version));
    for (const change of history.changes) strip.append(make('span', change.type.replaceAll('_', ' ') + (change.target ? ' · ' + change.target : ''), 'change-tag'));
    if (!history.changes.length) strip.append(make('span', 'No tracked behavior change'));
    footer.append(strip);
    if (history.previousCode && history.changes.length) {
      const comparison = make('details', undefined, 'comparison');
      const summary = make('summary', 'Compare the preceding version · ' + history.previousVersion);
      summary.dataset.help = 'history';
      const previousLocation = history.previousLocation;
      const start = previousLocation?.startLine ?? 1;
      const previousPath = previousLocation ? previousLocation.file + ':' + start + '–' + previousLocation.endLine : history.previousVersion;
      comparison.append(summary, make('p', previousPath, 'comparison-label'), codeView(history.previousCode, start, new Set(), previousPath));
      footer.append(comparison);
    }
  }
  const signals = make('details', undefined, 'signals');
  const signalSummary = make('summary', 'View ranking signals');
  signalSummary.dataset.help = 'signals';
  signals.append(signalSummary, make('p', 'Keyword ' + result.signals.lexical + ' · Vector ' + result.signals.vector + ' · Rank score ' + result.score));
  footer.append(signals); card.append(footer);
  return card;
}
const actions = {
  hybrid_retrieve: 'Find relevant candidates',
  inspect: 'Inspect the evidence',
  expand_version_relatives: 'Explore related versions',
  refine_candidates: 'Refine the search',
  stop: 'Stop with a ranked result',
};
const stopReasons = {
  enough_supported_results: 'Enough candidates satisfy the requested patterns.',
  candidate_exhaustion: 'No additional matching candidates to inspect.',
  candidate_budget: 'The inspection budget has been reached.',
  round_budget: 'The refinement limit has been reached.',
  semantic_ranking_complete: 'Relevance ranking is complete for this search lens.',
};
function render(data) {
  const results = data.results;
  $('result-count').textContent = String(results.length);
  $('summary').textContent = results.length + ' ranked snippets · ' + $('version').selectedOptions[0].textContent;
  $('metric-latency').textContent = data.stats.elapsedMs + ' ms';
  $('metric-inspected').textContent = String(data.stats.inspected);
  $('metric-supported').textContent = String(results.filter(r => r.certainty === 'supported-static-pattern').length);
  $('query-metrics').hidden = false;
  $('results').replaceChildren(...results.map(resultCard));
  if (!results.length) {
    const empty = make('div', undefined, 'empty-state');
    empty.append(make('div', '⌕', 'empty-orbit'), make('h3', 'No matching snippets in this view.'), make('p', 'Try another version or a more specific behavior.'));
    $('results').append(empty);
  }
  $('trace').replaceChildren();
  data.trace.forEach((step, i) => {
    const row = make('li'), content = make('div', undefined, 'trace-content');
    row.dataset.help = 'agent';
    const description = stopReasons[step.reason] ?? step.reason ?? '';
    content.append(make('strong', actions[step.action] ?? step.action.replaceAll('_', ' ')), make('p', description));
    row.append(make('span', String(i + 1).padStart(2, '0'), 'trace-number'), content);
    $('trace').append(row);
  });
}

let requestSequence = 0, activeRequest;
function setLoading(loading) {
  $('submit').disabled = loading;
  $('workspace').classList.toggle('is-searching', loading);
  document.querySelector('.results-region').setAttribute('aria-busy', String(loading));
  document.querySelector('.button-text').textContent = loading ? 'Tracing…' : 'Trace behavior';
}
async function run(event) {
  event?.preventDefault();
  if (!$('query').value.trim()) { $('query').focus(); return; }
  const sequence = ++requestSequence;
  activeRequest?.abort();
  activeRequest = new AbortController();
  setLoading(true); $('error').hidden = true;
  document.querySelectorAll('[data-query]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.query === $('query').value)));
  try {
    const response = await fetch('/api/search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: activeRequest.signal, body: JSON.stringify({ query: $('query').value, version: $('version').value, mode: $('mode').value, topK: 5 }) });
    const data = await response.json();
    if (sequence !== requestSequence) return;
    if (!response.ok) throw new Error(data.error ?? 'Search is unavailable. Please try again.');
    render(data);
  } catch (error) {
    if (sequence !== requestSequence || error.name === 'AbortError') return;
    $('error').textContent = error.message;
    $('error').hidden = false;
    if ($('results').querySelector('.result-card')) $('summary').textContent = 'Previous results · latest search failed';
  } finally { if (sequence === requestSequence) setLoading(false); }
}
$('search-form').addEventListener('submit', run);
$('query').addEventListener('keydown', event => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) run(event); });
document.querySelectorAll('[data-query]').forEach(button => button.addEventListener('click', () => { $('query').value = button.dataset.query; run(); }));
for (const id of ['version', 'mode']) $(id).addEventListener('change', run);

async function initialize() {
  try {
    const response = await fetch('/api/status');
    const data = await response.json();
    if (!response.ok) throw new Error('Index unavailable');
    for (const version of data.versions) {
      const option = make('option', version); option.value = version; $('version').append(option);
    }
    $('status-text').textContent = data.snippets + ' snippets · ' + data.versions.length + ' versions indexed';
    $('status').dataset.help = 'corpus';
    $('embedding').textContent = data.embedding === 'feature-hash-384' ? 'Offline feature-vector baseline' : data.embedding;
    await run();
  } catch (error) {
    $('status-text').textContent = error.message;
    $('error').textContent = 'The code index could not be loaded. Reload the page to reconnect.';
    $('error').hidden = false;
  }
}
await initialize();
