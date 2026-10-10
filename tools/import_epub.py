"""Import the supplied Barron's EPUB into a local, source-labelled practice bank.

Usage: python tools/import_epub.py PATH_TO_EPUB
Requires beautifulsoup4. No network access; the original EPUB is never modified.
Generated book assets are intentionally excluded from Git.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import posixpath
import re
import zipfile
from pathlib import Path
from bs4 import BeautifulSoup, Comment, Tag

ROOT = Path(__file__).resolve().parents[1]
ALLOWED = {'p', 'div', 'span', 'b', 'strong', 'i', 'em', 'u', 'sub', 'sup',
           'br', 'ol', 'ul', 'li', 'table', 'thead', 'tbody', 'tr', 'td', 'th',
           'figure', 'figcaption', 'img', 'h3', 'h4', 'blockquote'}
BLOCKED = {'script', 'style', 'iframe', 'object', 'embed', 'svg', 'form', 'input', 'button'}
CHAPTER_UNITS = {1:[1], 2:[1], 3:[2,4], 4:[2], 5:[1,4], 6:[3], 7:[3],
                 8:[3], 9:[7], 10:[5], 11:[6,9], 12:[4,9], 13:[8], 14:[]}


class Importer:
    def __init__(self, archive, output):
        self.z = archive
        self.output = output
        self.images = {}
        self.image_names = {}
        self.warnings = []

    def clean(self, html, source):
        """Allowlist markup and copy only referenced local raster images."""
        s = BeautifulSoup(str(html), 'html.parser')
        for c in s.find_all(string=lambda x: isinstance(x, Comment)):
            c.extract()
        for t in list(s.find_all(True)):
            if t.parent is None:
                continue
            if t.name in BLOCKED:
                t.decompose()
                continue
            if t.name not in ALLOWED:
                t.unwrap()
                continue
            attrs = {}
            if t.name in {'ol', 'ul'}:
                classes = t.get('class', [])
                if any('lower-alpha' in c for c in classes): attrs['class'] = 'book-alpha'
                if any('upper-latin' in c for c in classes): attrs['class'] = 'book-upper'
                if t.get('start', '').isdigit(): attrs['start'] = t['start']
            if t.name in {'td', 'th'}:
                for a in ('rowspan', 'colspan'):
                    if str(t.get(a, '')).isdigit(): attrs[a] = t[a]
            if t.name == 'img':
                src = str(t.get('src', ''))
                path = posixpath.normpath(posixpath.join(posixpath.dirname(source), src))
                if not src or ':' in src or src.startswith('/') or not path.startswith('OEBPS/images/'):
                    t.decompose(); self.warnings.append(f'Blocked image: {src}'); continue
                if path not in self.z.namelist() or Path(path).suffix.lower() not in {'.png','.jpg','.jpeg','.gif','.webp'}:
                    t.decompose(); self.warnings.append(f'Missing/unsupported image: {path}'); continue
                if path not in self.image_names:
                    name = f'image-{len(self.image_names)+1}{Path(path).suffix.lower()}'
                    self.image_names[path] = name
                    self.images[name] = path
                name = self.image_names[path]
                attrs = {'src': '__BOOK_ASSETS__/' + name, 'alt': str(t.get('alt', 'Book figure')),
                         'loading': 'lazy'}
            t.attrs = attrs
        return str(s).strip()

    def parse(self, source):
        b = BeautifulSoup(self.z.read(source), 'html.parser').body
        name = Path(source).stem
        title = next((h.get_text(' ', strip=True) for h in b.find_all('h1') if not h.get_text(strip=True).isdigit()), name)
        chapter = int(name[7:]) if name.startswith('chapter') else None
        group = {'id':name, 'title':title, 'kind':'chapter' if chapter else ('diagnostic' if name.startswith('dt') else 'test'),
                 'units':CHAPTER_UNITS.get(chapter, []), 'questions':[], 'sheets':{}}
        stage = 'q' if name.startswith('dt') else None
        typ = 'mcq'
        context = []
        pending = ''
        carry = ''
        context_range = None
        questions = {'mcq':{}, 'frq':{}}
        answers = {'mcq':{}, 'frq':{}}
        sheet = {'mcq':[], 'frq':[]}
        for x in b.find_all(recursive=False):
            if x.name in {'h2', 'h3'}:
                text = x.get_text(' ', strip=True).lower()
                if 'practice exercises' in text or text == 'section i': stage = 'q'
                if 'answers and explanations' in text: stage = 'a'
                if 'evaluating your results' in text or 'chapter references' in text: stage = None
                if 'free-response' in text or text == 'section ii': typ = 'frq'
                if 'multiple-choice' in text: typ = 'mcq'
                context = []; pending = ''; carry = ''
                context_range = None
                continue
            if not stage: continue
            html = self.clean(x, source)
            if stage == 'q': sheet[typ].append(html)
            if x.name != 'ol':
                if stage == 'q': context.append(html)
                continue
            # A chapter's lettered FRQ parts form ONE task with its shared stem.
            is_parts = typ == 'frq' and (any('lower-alpha' in c for c in x.get('class', [])) or (chapter == 11 and not x.get('class')))
            items = [x] if is_parts else x.find_all('li', recursive=False)
            start = int(x.get('start', 1))
            for offset, li in enumerate(items):
                records = answers[typ] if stage == 'a' else questions[typ]
                number = max(records, default=0) + 1 if is_parts else start + offset
                if stage == 'a':
                    answers[typ][number] = self.clean(li.decode_contents() if not is_parts else str(li), source)
                    continue
                node = BeautifulSoup(str(li), 'html.parser').find(li.name)
                opts = next((o for o in node.find_all('ol', recursive=False) if 'upper-latin' in o.get('class', [])), None) if typ == 'mcq' else None
                choices = []
                tail = ''
                if opts:
                    choices = [self.clean(o.decode_contents(), source) for o in opts.find_all('li', recursive=False)]
                    # EPUB figures/tables after the options introduce the NEXT question.
                    following = [s for s in opts.next_siblings if isinstance(s, Tag)]
                    tail = ''.join(self.clean(s, source) for s in following)
                    for s in following: s.extract()
                    opts.extract()
                stem = self.clean(str(node) if is_parts else node.decode_contents(), source)
                if pending or context:
                    carry = ''.join(context) if context else pending
                    text = BeautifulSoup(carry, 'html.parser').get_text(' ', strip=True)
                    match = re.search(r'\bquestions?\s+(\d+)(?:\s*([-–—]|to|and)\s*(\d+))?\b', text, re.I)
                    if match:
                        first, last = int(match[1]), int(match[3] or match[1])
                        context_range = {first, last} if (match[2] or '').lower() == 'and' else range(first, last+1)
                    else:
                        context_range = None
                # Preserve shared passages for groups; do not attach unrelated earlier figures.
                uses_context = bool(re.search(r'\b(above|following|table|diagram|graph|data|questions? \d+)\b', node.get_text(' ',strip=True), re.I))
                if context_range:
                    shared = carry if number in context_range else ''
                else:
                    shared = carry if (pending or context or uses_context) else ''
                questions[typ][number] = {'id':f'{name}-{typ}-{number}', 'type':typ, 'number':number,
                    'stem':stem, 'context':shared, 'options':choices, 'sourceFile':source}
                pending = tail
                context = []
        for typ in ('mcq','frq'):
            mismatch = set(questions[typ]) != set(answers[typ])
            if mismatch: self.warnings.append(f'{name}/{typ}: question/answer numbering differs; auto-grading disabled')
            for n, q in questions[typ].items():
                q['explanation'] = answers[typ].get(n, '')
                text = BeautifulSoup(q['explanation'], 'html.parser').get_text(' ',strip=True)
                match = re.match(r'^\s*\(\s*([A-D])\s*\)(?:\s|$)', text)
                q['answer'] = ord(match[1])-65 if match and len(q['options']) == 4 and not mismatch else None
                q['reviewRequired'] = typ == 'mcq' and q['answer'] is None
                group['questions'].append(q)
            group['sheets'][typ] = ''.join(sheet[typ])
        return group

    def run(self):
        sources = [f'OEBPS/chapter{i:02}.xhtml' for i in range(1,15)] + [f'OEBPS/dt{i:02}.xhtml' for i in range(1,4)] + [f'OEBPS/pt{i:02}.xhtml' for i in range(1,4)]
        missing = [s for s in sources if s not in self.z.namelist()]
        if missing: raise ValueError('This importer expects Barron\'s AP Chemistry Premium 2025 chapter/test files: '+', '.join(missing))
        groups = [self.parse(s) for s in sources]
        data = {'schema':1, 'title':'AP Chemistry Premium 2025', 'author':'Neil D. Jespersen',
                'language':'en', 'groups':groups, 'warnings':self.warnings}
        self.output.mkdir(parents=True, exist_ok=True)
        image_dir = self.output/'images'; image_dir.mkdir(exist_ok=True)
        for name, src in self.images.items(): (image_dir/name).write_bytes(self.z.read(src))
        raw = json.dumps(data, ensure_ascii=False, separators=(',', ':'))
        (self.output/'data.js').write_text('window.AP_BOOK_DATA = '+raw+';\n',encoding='utf-8')
        qs = [q for g in groups for q in g['questions']]
        report = {'groups':len(groups), 'mcq':sum(q['type']=='mcq' for q in qs), 'frq':sum(q['type']=='frq' for q in qs),
                  'autoGraded':sum(q['answer'] is not None for q in qs), 'images':len(self.images),
                  'reviewRequired':[q['id'] for q in qs if q['reviewRequired']], 'warnings':self.warnings,
                  'dataSha256':hashlib.sha256(raw.encode()).hexdigest()}
        (self.output/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
        return report


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('epub',type=Path)
    p.add_argument('--output',type=Path,default=ROOT/'ap-chem-site/assets/book-local')
    args = p.parse_args()
    with zipfile.ZipFile(args.epub) as z:
        print(json.dumps(Importer(z,args.output).run(),ensure_ascii=False,indent=2))
