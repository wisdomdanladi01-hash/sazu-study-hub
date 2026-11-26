import re
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path
import pypdfium2 as pdfium

res_dir = Path('../resources')

def get_docx_text(path: Path) -> str:
    try:
        with zipfile.ZipFile(path) as z:
            xml_content = z.read('word/document.xml')
            tree = ET.fromstring(xml_content)
            # Find all text elements
            texts = [node.text for node in tree.iter('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}t') if node.text]
            return ' '.join(texts)
    except Exception as e:
        return ''

matric_pattern = re.compile(
    r'(matric(?:ulation)?\s*(?:no\.?|number)?[\s:=]+[A-Za-z0-9/\-_]+|[A-Za-z]{2,6}\s*/\s*\d{2,4}\s*/\s*\d{2,6}|cscu[^\n\r,;]{3,20})',
    re.IGNORECASE
)

print('=== SCANNING FOR MATRIC NUMBERS ===')
findings = {}
for f in sorted(res_dir.iterdir()):
    if not f.is_file():
        continue
    text = ''
    try:
        if f.suffix.lower() == '.pdf':
            doc = pdfium.PdfDocument(str(f))
            for p_idx in range(min(5, len(doc))):
                text += doc[p_idx].get_textpage().get_text_range() + '\n'
        elif f.suffix.lower() == '.docx':
            text = get_docx_text(f)
        
        matches = matric_pattern.findall(text)
        is_suspicious = bool(matches) or any(k in f.name.lower() for k in ['spencer', 'assignment', 'coversheet', 'group'])
        if is_suspicious:
            findings[f.name] = {
                'matches': list(set(matches)),
                'snippet': text[:400].replace('\n', ' ')
            }
            print(f"\nFILE: {f.name}")
            if matches:
                print(f"   Matches: {set(matches)}")
            print(f"   Preview: {text[:250].replace(chr(10), ' ')}")
    except Exception as e:
        print(f"Error reading {f.name}: {e}")

print(f"\nTotal suspicious or matched files: {len(findings)}")
