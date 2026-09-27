"""Fill the supplied Samsung template without third-party presentation dependencies."""
import argparse
from pathlib import Path
import zipfile
import xml.etree.ElementTree as ET

NS = {'a': 'http://schemas.openxmlformats.org/drawingml/2006/main',
      'p': 'http://schemas.openxmlformats.org/presentationml/2006/main'}
for prefix, uri in NS.items():
    ET.register_namespace(prefix, uri)

CONTENT = {
    1: (5, [
        'Theme 01 — Agentic Code Intelligence',
        'Project — CodeStrata: code has a memory',
        'Team name — [TEAM TO COMPLETE]',
        'College — [TEAM TO COMPLETE]',
        'Contributor — Advay [full name and email to complete]',
        'Other members — [confirm or remove]',
        'GitHub — github.com/AdvayV/AgenticIntelligence',
    ]),
    2: (1, [
        'Find the exact version where behavior changed.',
        'Even when the function was renamed and moved.',
        'CPU-only JavaScript retrieval with source, lines, versions, and evidence.',
        'P0: retrieval quality. P1: versions. Bonus: evolutionary investigation.',
        'Output is reviewable code evidence; no generated fixes.',
    ]),
    3: (1, [
        'Similar snippets can behave differently after a one-token change.',
        'Names and file paths stop being reliable after refactors.',
        'A ranked match alone does not explain a wrong-version result.',
        'Our focus: contrast the match with a version that contradicts it.',
        'Existing code search and agentic investigation already exist.',
        'Differentiation is the integration; no universal novelty claim.',
    ]),
    4: (1, [
        'Git snapshots → Babel AST, source comments, exact locations',
        '→ Cached BM25 postings + quantized CPU embedding vectors',
        'Query → local constraint planner → fused candidate ranking',
        '→ inspect evidence → follow version/import links → bounded stop',
        '→ code + timeline + contradicting version + streamed trace',
        'Conservative lineage: unique symbols, then mutual structural matches.',
    ]),
    5: (1, [
        'Ask: Where did device pairing stop waiting for policyCheck?',
        'v1: connectDevice in devices/connect.js directly awaits the call.',
        'v2: pairDevice in flows/pair.js removes that await.',
        'v3: the direct await returns. Inspect all three on the timeline.',
        'Open policyCheck through its resolved local import.',
        'Video link — [TEAM TO RECORD, maximum 5 minutes]',
    ]),
    6: (1, [
        'Node.js + JavaScript; Babel parser; plain HTML/CSS/modules.',
        'BM25 + normalized cosine vectors + reciprocal rank fusion.',
        'Optional Transformers.js q8 BGE / MiniLM on CPU, two threads.',
        'Deterministic planner; no LLM API, GPU, or repository execution.',
        'Python/MTEB for official evaluation; persistent Node encoder.',
        'Node tests, jsdom, Playwright, Docker, GitHub Actions.',
    ]),
    7: (1, [
        'Review a refactor that silently removed a direct await.',
        'Locate changed guard presence or simple invocation order.',
        'Find an exact deeplink and inspect its version-specific source.',
        'Navigate related helpers without inventing execution guarantees.',
        'Useful for regression triage and version migration reviews.',
        'Static evidence supports inspection; it does not prove a runtime bug.',
    ]),
    8: (1, [
        'Controlled development: 8/8 correct top results, 1,025 snippets.',
        '60 frozen source-reviewed queries: Async + Express.',
        'BGE hybrid NDCG@10: Async 0.6717; Express 0.8577.',
        'Official AppsRetrieval: NDCG@10 0.0505; MRR@10 0.043363.',
        'Official screening accuracy is weak; not a competitive claim.',
        'AI-assisted labels, small corpora, heuristic lineage, bounded syntax.',
    ]),
    9: (1, [
        'Prioritize a code-specific encoder using separate development data.',
        'Collect independently labeled multi-commit repository questions.',
        'Explain the gap between development and official test accuracy.',
        'Broaden conservative lineage and supported import patterns.',
        'Measure larger repositories before adding approximate indexes.',
        'Finish team identity, video, disclosure, and organizer review.',
    ]),
    10: (1, [
        'Behavior evidence survives a simultaneous rename and file move.',
        'Counterexamples expose why a nearby version does not match.',
        'Ambiguous copies and refactors stay unresolved.',
        'Live agent events, not a simulated progress animation.',
        'Light timeline workspace with hover/focus/tap explanations.',
        'CPU-only, transparent limits, and reproducible raw results.',
    ]),
    11: (1, [
        'Prototype code + setup README — YES, public GitHub.',
        'Tests + browser/Docker workflows — see latest Actions status.',
        'Official MTEB JSON + real-repository artifacts — YES, docs/results.',
        'Presentation draft — YES; team details remain incomplete.',
        'Video + signed AI disclosure — PENDING team action.',
        'Final judged release/tag — PENDING submission readiness.',
    ]),
}


def fill(xml, shape_index, lines, size):
    root = ET.fromstring(xml)
    shape = root.findall('.//p:sp', NS)[shape_index]
    body = shape.find('p:txBody', NS)
    if body is None:
        body = ET.SubElement(shape, '{' + NS['p'] + '}txBody')
        ET.SubElement(body, '{' + NS['a'] + '}bodyPr')
        ET.SubElement(body, '{' + NS['a'] + '}lstStyle')
    for paragraph in list(body.findall('a:p', NS)):
        body.remove(paragraph)
    for line in lines:
        paragraph = ET.SubElement(body, '{' + NS['a'] + '}p')
        props = ET.SubElement(paragraph, '{' + NS['a'] + '}pPr')
        ET.SubElement(props, '{' + NS['a'] + '}buNone')
        spacing = ET.SubElement(props, '{' + NS['a'] + '}spcAft')
        ET.SubElement(spacing, '{' + NS['a'] + '}spcPts', {'val': '1200'})
        run = ET.SubElement(paragraph, '{' + NS['a'] + '}r')
        style = ET.SubElement(run, '{' + NS['a'] + '}rPr', {'lang': 'en-US', 'sz': str(size)})
        color = ET.SubElement(style, '{' + NS['a'] + '}solidFill')
        ET.SubElement(color, '{' + NS['a'] + '}srgbClr', {'val': '24243B'})
        ET.SubElement(style, '{' + NS['a'] + '}latin', {'typeface': 'Aptos'})
        ET.SubElement(run, '{' + NS['a'] + '}t').text = line
    return ET.tostring(root, encoding='utf-8', xml_declaration=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--template', required=True)
    parser.add_argument('--output', default='docs/CodeStrata-Submission-Draft.pptx')
    args = parser.parse_args()
    target = Path(args.output)
    target.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(args.template) as source, zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED) as out:
        for entry in source.infolist():
            payload = source.read(entry.filename)
            for number, (shape, lines) in CONTENT.items():
                if entry.filename == f'ppt/slides/slide{number}.xml':
                    payload = fill(payload, shape, lines, 1600 if number == 1 else 2200)
            out.writestr(entry, payload)
    with zipfile.ZipFile(target) as check:
        assert check.testzip() is None
        for name in check.namelist():
            if name.endswith('.xml'):
                ET.fromstring(check.read(name))
    print(f'Prepared and XML-validated 12-slide draft: {target}')


if __name__ == '__main__':
    main()
