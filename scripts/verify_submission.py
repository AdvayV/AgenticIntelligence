"""Check portable submission artifacts without Office or Python packages."""
import json
from pathlib import Path
import xml.etree.ElementTree as ET
import zipfile

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / 'docs'
NS = {'p': 'http://schemas.openxmlformats.org/presentationml/2006/main',
      'a': 'http://schemas.openxmlformats.org/drawingml/2006/main',
      'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}


def verify_deck():
    deck = DOCS / 'CodeStrata-Submission-Draft.pptx'
    with zipfile.ZipFile(deck) as archive:
        assert archive.testzip() is None
        presentation = ET.fromstring(archive.read('ppt/presentation.xml'))
        bounds = presentation.find('p:sldSz', NS)
        width, height = int(bounds.get('cx')), int(bounds.get('cy'))
        slides = [name for name in archive.namelist() if name.startswith('ppt/slides/slide') and name.endswith('.xml')]
        assert len(slides) == 12
        text = []
        for filename in slides:
            root = ET.fromstring(archive.read(filename))
            text.extend(node.text or '' for node in root.findall('.//a:t', NS))
            for shape in root.findall('.//p:sp', NS):
                transform = shape.find('.//a:xfrm', NS)
                if transform is None:
                    continue
                off, ext = transform.find('a:off', NS), transform.find('a:ext', NS)
                if off is None or ext is None:
                    continue
                x, y = int(off.get('x')), int(off.get('y'))
                w, h = int(ext.get('cx')), int(ext.get('cy'))
                assert x >= 0 and y >= 0 and x + w <= width and y + h <= height, (filename, x, y, w, h)
        joined = ' '.join(text)
        for required in ['Advay Vivek', 'Kaavish Gogia', '24BCT0136', '24BCT0103',
                         'advay.vivek2024@vitstudent.ac.in', 'kaavish.gogia2024@vitstudent.ac.in',
                         'Vellore Institute of Technology', '0.0505', 'pairDevice',
                         'BM25 + CPU vectors', 'Jina Code']:
            assert required in joined, required
        code_result = DOCS / 'results' / 'appsretrieval_jina.json'
        if code_result.exists():
            code_score = json.loads(code_result.read_text(encoding='utf-8'))['scores']['test'][0]['ndcg_at_10']
            if code_score > 0.0505:
                assert f'{code_score:.4f}' in joined, 'Deck does not show the selected official result'
        assert 'TEAM TO COMPLETE' not in joined
        assert 'Finish team identity' not in joined
        assert 'Prioritize a code-specific encoder' not in joined
    print('Presentation: 12 slides, team details, results, and canvas bounds verified.')


def verify_disclosure():
    with zipfile.ZipFile(DOCS / 'CodeStrata-AI-Disclosure-Draft.docx') as archive:
        assert archive.testzip() is None
        root = ET.fromstring(archive.read('word/document.xml'))
        content = ' '.join(node.text or '' for node in root.findall('.//w:t', NS))
        for required in ['Advay Vivek', 'Kaavish Gogia', 'OpenAI Codex',
                         'TEAM REPRESENTATIVE TO SIGN', 'Vellore Institute of Technology']:
            assert required in content, required
    print('AI disclosure: factual fields verified; human signature explicitly pending.')


def verify_results():
    folder = DOCS / 'results'
    official = json.loads((folder / 'appsretrieval_results.json').read_text(encoding='utf-8'))
    assert official['task_name'] == 'AppsRetrieval'
    assert official['mteb_version'] == '2.21.8'
    assert official['scores']['test'][0]['ndcg_at_10'] == 0.0505
    code_result = folder / 'appsretrieval_jina.json'
    if code_result.exists():
        code = json.loads(code_result.read_text(encoding='utf-8'))
        assert code['task_name'] == official['task_name']
        assert code['mteb_version'] == official['mteb_version']
        assert code['dataset_revision'] == official['dataset_revision']
        assert 0 <= code['scores']['test'][0]['ndcg_at_10'] <= 1
    for name in ['challenge.json', 'encoder-development.json']:
        json.loads((folder / name).read_text(encoding='utf-8'))
    code = json.loads((folder / 'code-encoder-development.json').read_text(encoding='utf-8'))
    assert code['mode'] == 'jina' and code['queries'] == 128 and code['documents'] == 1000
    assert code['ndcg_at_10'] > 0.70
    audit = json.loads((folder / 'appsretrieval-dataset-audit.json').read_text(encoding='utf-8'))
    assert audit['test_queries']['count'] == 3765 and audit['all_documents']['count'] == 8765
    repos = json.loads((folder / 'repositories.json').read_text(encoding='utf-8'))
    assert repos['queries'] == 60 and all('jina' in repo['measurements'] for repo in repos['repositories'])
    print('Evaluation artifacts: official MTEB JSON, dataset audit, and development results verified.')


if __name__ == '__main__':
    verify_deck()
    verify_disclosure()
    verify_results()
