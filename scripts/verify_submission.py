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
                         'Vellore Institute of Technology', '0.0505', 'pairDevice', 'BM25 + CPU vectors']:
            assert required in joined, required
        assert 'TEAM TO COMPLETE' not in joined
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
    for name in ['challenge.json', 'repositories.json', 'encoder-development.json']:
        json.loads((folder / name).read_text(encoding='utf-8'))
    print('Evaluation artifacts: official MTEB JSON and development results verified.')


if __name__ == '__main__':
    verify_deck()
    verify_disclosure()
    verify_results()
