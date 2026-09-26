const $ = id => document.getElementById(id);
const make = (tag, text, className) => { const el = document.createElement(tag); if (text !== undefined) el.textContent = text; if (className) el.className = className; return el; };
let requestSequence = 0;
async function run(event) {
  event?.preventDefault();
  const sequence = ++requestSequence;
  $('submit').disabled = true; $('error').hidden = true;
  try {
    const response = await fetch('/api/search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: $('query').value, version: $('version').value, mode: $('mode').value, topK: 5 }) });
    const data = await response.json(); if (!response.ok) throw new Error(data.error); if (sequence !== requestSequence) return;
    $('summary').textContent = `${data.results.length} results · ${data.stats.elapsedMs} ms · ${data.stats.inspected} inspected`;
    $('results').replaceChildren(); $('trace').replaceChildren();
    if (!data.results.length) $('results').append(make('p', 'No matching snippets in this index.', 'muted'));
    for (const result of data.results) {
      const card = make('article'), head = make('div', undefined, 'card-head'), meta = make('div');
      meta.append(make('strong', `${String(result.rank).padStart(2, '0')} / ${result.name}`), make('div', `${result.file}:${result.startLine}–${result.endLine} · ${result.version}`, 'location'));
      head.append(meta, make('span', result.certainty, `pill ${['uncertain', 'contradicted'].includes(result.certainty) ? 'uncertain' : ''}`)); card.append(head);
      const pre = make('pre'), lines = new Set(result.evidence.flatMap(e => e.lines));
      result.code.split('\n').forEach((line, i) => { const n = result.startLine + i; const span = make('span', undefined, `code-line ${lines.has(n) ? 'hit' : ''}`); span.append(make('span', n, 'number'), document.createTextNode(line)); pre.append(span); }); card.append(pre);
      const details = make('div', undefined, 'evidence');
      for (const evidence of result.evidence) { const row = make('div'); row.append(make('strong', `${evidence.status.toUpperCase()} / `, evidence.status), document.createTextNode(evidence.details)); details.append(row); }
      if (!result.evidence.length) details.append(make('div', `Lexical ${result.signals.lexical} · vector ${result.signals.vector} · no structural certificate requested`));
      if (result.history.previousVersion) details.append(make('div', `Δ ${result.history.previousVersion} → ${result.version}: ${result.history.changes.map(c => `${c.type} ${c.target ?? c.condition ?? ''}`).join(' · ') || 'no tracked behavior change'}`, 'history'));
      if (result.history.previousCode && result.history.changes.length) {
        const previous = make('details'), summary = make('summary', `Compare predecessor · ${result.history.previousVersion}`);
        previous.append(summary, make('pre', result.history.previousCode)); details.append(previous);
      }
      card.append(details); $('results').append(card);
    }
    for (const step of data.trace) { const row = make('li'); row.append(make('strong', step.action.replaceAll('_', ' ')), document.createTextNode(step.reason ?? '')); $('trace').append(row); }
  } catch (error) { if (sequence === requestSequence) { $('error').textContent = error.message; $('error').hidden = false; } }
  finally { if (sequence === requestSequence) $('submit').disabled = false; }
}
$('search-form').addEventListener('submit', run);
document.querySelectorAll('[data-query]').forEach(button => button.addEventListener('click', () => { $('query').value = button.dataset.query; run(); }));
try {
  const response = await fetch('/api/status'); const data = await response.json(); if (!response.ok) throw new Error('Index unavailable');
  for (const version of data.versions) { const option = make('option', version); option.value = version; $('version').append(option); }
  $('status').textContent = `${data.snippets} snippets / ${data.versions.length} versions`;
  $('embedding').textContent = data.embedding === 'feature-hash-384' ? 'Offline feature-vector baseline' : data.embedding; run();
} catch (error) { $('status').textContent = error.message; }
