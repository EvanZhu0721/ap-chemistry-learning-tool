# AP Chemistry Learning Tool

A static AP Chemistry learning site with interactive labs, bilingual explanations,
LaTeX/chemical-equation typesetting, and a local EPUB practice bank.

## Preview

Python 3:

```powershell
python -m http.server 8000 --bind 127.0.0.1 --directory ap-chem-site
```

Open `http://localhost:8000`. Use **Language / 语言** to switch the new study
content and main navigation between Chinese and English. The language preference
is stored on this browser/device. Use **Study guide / 双语讲解** for the 14-chapter
guide or open any of the 49 course tabs for its focused explanation.

The new explanations follow the review chapter organisation of Neil D. Jespersen's
*AP Chemistry Premium 2025*. They are independently written bilingual study notes,
not a full translation of the book. Each chapter includes prerequisites, learning goals, three sequential teaching
sections, two worked examples, two self-checks with hidden answers, a formula recap,
and common mistakes. Both languages contain the same explanations and calculations.

In the guide and all course tabs, English key terms are bold. Select an English
word or a short chemistry phrase to see its Chinese definition in a local popup.
Click a bold term, or focus it with Tab and press Enter, for the same lookup.
Definitions combine the new lecture glossary with the existing local dictionary;
unrecognised words show an explicit missing-entry message. **Save to vocabulary**
adds the entry to the existing vocabulary/recall list. No lookup request is sent
to a translation service. Escape closes the definition before closing the guide.
Course panels render their extended notes when opened to avoid building every
chapter repeatedly on page load.
The original interactive labs and detailed Chinese notes remain available in an
expandable section. Their internal animation labels and some legacy utilities
remain in Chinese; they are not presented as fully translated.

## Formula rendering

KaTeX **0.16.22**, its fonts, auto-render extension and `mhchem` extension are
vendored under `ap-chem-site/assets/vendor/katex/`. Rendering makes no CDN request.
KaTeX's MIT license is included in that directory.

Use `\( ... \)` for inline TeX and `\[ ... \]` or `$$ ... $$` for display math.
For chemistry use `\ce{...}`, for example `\(\ce{H+ + OH- -> H2O}\)`.
`window.AP_renderMath(container)` renders newly inserted content; question-bank
updates also invoke this renderer. Existing plain-text formulas are not silently
converted or guessed. The formula sheet now includes typeset equations with
units, alongside its original reference entries.

## Import a local book

The import tool supports the supplied Barron's *AP Chemistry Premium 2025* EPUB
layout: 14 review chapters, 3 diagnostic tests, and 3 in-book practice tests.
The additional online tests are not in the EPUB and are not imported.

```powershell
python -m pip install -r tools/requirements.txt
python tools/import_epub.py "C:\path\to\AP_Chemistry_Premium_2025.epub"
```

Open **Book practice / 书本题库**. Filter by chapter/test, question type, search
text, or mistakes. Text/image choices are retained. Where four separate options
and a letter answer are reliably extracted, the app grades the question. Other
questions and FRQs show the original explanation for self-assessment.

The importer preserves shared passages and figures and provides the original
question section to verify context. Lettered subparts of a chapter FRQ remain one
task. It uses an HTML allowlist, blocks external resources, copies referenced
raster images, and disables grading if question and answer numbering disagree.
Import counts and questions needing review are recorded in
`ap-chem-site/assets/book-local/report.json`. Automatic grading reflects the
book's printed answer key; it is not an independent verification of every answer.

Generated content lives in `ap-chem-site/assets/book-local/`, which is ignored by
Git. Importing does not upload the EPUB or change it. Keep these personal book
assets local; the distributable code works without them and shows an empty state.
Book practice history is stored separately in `apchem.bookHistory.v1` in browser
local storage. It does not yet synchronise through the account backend or merge
with the legacy review book. FRQ working is kept only while viewing the question.

## Source layout and syncing

- `AP化学学习工具.html`: original application source plus the enhancement includes.
- `sync-site.py`: generates site HTML, CSS, and the original application JS from
  the source file, using repository-relative paths.
- `ap-chem-site/assets/study-content.js`: 14 bilingual chapter explanations.
- `ap-chem-site/assets/topic-notes.js`: 49 focused bilingual topic notes.
- `ap-chem-site/assets/lesson-details.js`: paired teaching sections, worked examples and self-checks.
- `ap-chem-site/assets/lecture-glossary.js`: local chemistry term definitions.
- `ap-chem-site/assets/study-enhancements.js`: language, guide, word lookup, maths and book UI.
- `tools/import_epub.py`: local book importer.
- `account-server/`: existing Node.js account service; unchanged by this feature.

Run `python sync-site.py` after changing the original HTML. The generated site
retains the enhancement includes. Edit the new content modules directly; they
are not regenerated. The root HTML and site share the vendored renderer, so the
root HTML now needs the adjacent `ap-chem-site/assets/` folder when copied.

## Checks

```powershell
python -m unittest discover -s tests -p "test_*.py" -v
node --test tests/study.test.cjs
node --check ap-chem-site/assets/study-enhancements.js
```

Tests cover shared question context, FRQ grouping, mismatched answer numbering,
markup sanitisation, all 49 topic mappings, bilingual content completeness,
parsing all authored TeX with `mhchem`, and script order for both entry points.
