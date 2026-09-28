"""Fill factual fields in the supplied AI disclosure; leave human sign-off blank."""
import argparse
from pathlib import Path
import xml.etree.ElementTree as ET
import zipfile

W = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
ET.register_namespace('w', W[1:-1])

FIELDS = {
    3: 'Team Name: CodeStrata — Advay Vivek (24BCT0136), Kaavish Gogia (24BCT0103)',
    4: 'Project / Product Name: CodeStrata — Evidence-aware evolutionary code retrieval',
    5: 'Organization / Institution: Vellore Institute of Technology (VIT University)',
    6: 'Submission Date: [TEAM TO ENTER ACTUAL SUBMISSION DATE]',
    9: 'Did your team use AI in developing this project? Yes — OpenAI Codex assisted development.',
    10: 'The team must review this declaration and sign it before submission.',
    13: 'Idea generation / brainstorming: AI assisted project scoping and the version-counterexample concept.',
    14: 'Code generation or assistance: AI drafted analyzer, retrieval, UI, benchmark adapters, and CI; team reviews the final code.',
    15: 'UI / UX design: AI drafted the light animated timeline and explanatory side panel.',
    16: 'Content creation: AI drafted README, demo narrative, deck, and validation report.',
    17: 'Data analysis: AI assisted benchmark setup and interpretation. Real-repository labels are AI-assisted, not independent human annotations.',
    18: 'Testing / debugging: AI drafted regression, browser, Docker, and evaluation checks; defects were corrected after validation.',
    19: 'Other: Public BGE and Jina embedding weights run locally on CPU. The application does not call an LLM API.',
    22: '1. Feature Name: Version-aware behavior investigation and counterexamples',
    23: '2. Origin: Both — team direction, AI-assisted design and implementation.',
    24: '3. Tool: OpenAI Codex. Prompts: find behavior changes across renamed/moved code; use CPU only; attach source and uncertainty. Output: AST facts, lineage, bounded agent, counterexample view. Modifications: tests and conservative ambiguity handling.',
    26: '1. Feature Name: Local CPU retrieval, evaluation, and presentation',
    27: '2. Origin: Both — team direction, AI-assisted code and documentation.',
    28: '3. Tool: OpenAI Codex. Prompts: improve code retrieval, validate on official AppsRetrieval, create light UI and submission artifacts. Output: embedding adapters, benchmarks, UI, tests, deck. Modifications: benchmark audit, model comparison, bug fixes. See docs/ai-usage.md.',
    36: 'Name of Team Representative: Advay Vivek',
    37: 'Role: Team representative and contributor',
    38: 'Signature: [TEAM REPRESENTATIVE TO SIGN]',
    39: 'Date: [TEAM REPRESENTATIVE TO ENTER DATE]',
}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--template', required=True)
    parser.add_argument('--output', default='docs/CodeStrata-AI-Disclosure-Draft.docx')
    args = parser.parse_args()
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(args.template) as source, zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as target:
        for entry in source.infolist():
            data = source.read(entry.filename)
            if entry.filename == 'word/document.xml':
                root = ET.fromstring(data)
                paragraphs = root.findall('.//' + W + 'p')
                for index, value in FIELDS.items():
                    texts = paragraphs[index].findall('.//' + W + 't')
                    if not texts:
                        raise ValueError(f'Disclosure paragraph {index} is missing text')
                    texts[0].text = value
                    for text in texts[1:]:
                        text.text = ''
                data = ET.tostring(root, encoding='utf-8', xml_declaration=True)
            target.writestr(entry, data)
    with zipfile.ZipFile(output) as check:
        assert check.testzip() is None
        content = check.read('word/document.xml')
        ET.fromstring(content)
        assert b'Advay Vivek' in content and b'TEAM REPRESENTATIVE TO SIGN' in content
    print(f'Prepared factual disclosure draft; signature remains blank: {output}')


if __name__ == '__main__':
    main()
