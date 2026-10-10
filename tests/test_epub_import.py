import importlib.util
import io
import tempfile
import unittest
import zipfile
from pathlib import Path

SPEC = importlib.util.spec_from_file_location('import_epub',Path(__file__).parents[1]/'tools/import_epub.py')
MOD = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MOD)


class ImportTests(unittest.TestCase):
    def fixture(self, html):
        buf=io.BytesIO()
        with zipfile.ZipFile(buf,'w') as z:
            z.writestr('OEBPS/chapter01.xhtml',html)
            z.writestr('OEBPS/images/figure.png',b'fixture')
        buf.seek(0)
        temp=tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        archive=zipfile.ZipFile(buf);self.addCleanup(archive.close)
        return MOD.Importer(archive,Path(temp.name))

    def test_preserves_shared_context_and_matches_explicit_numbering(self):
        imp=self.fixture('''<body><h1>Atoms</h1><h2>PRACTICE EXERCISES</h2><h3>Multiple-Choice</h3>
        <ol class="ol10"><li>First?<ol class="upper-latin"><li>A</li><li>B</li><li>C</li><li>D</li></ol>
        <table><tr><td>Shared data</td></tr></table><img src="images/figure.png"></li>
        <li>Use the table above.<ol class="upper-latin"><li>A</li><li>B</li><li>C</li><li>D</li></ol></li></ol>
        <p>Questions 3 refer to the same diagram.</p><ol start="3"><li>Third?<ol class="upper-latin"><li>A</li><li>B</li><li>C</li><li>D</li></ol></li></ol>
        <h2>Answers and Explanations</h2><h3>Multiple-Choice</h3><ol><li><b>(B)</b> Reason</li><li><b>( C)</b></li><li><b>(A)</b> Other reason</li></ol></body>''')
        g=imp.parse('OEBPS/chapter01.xhtml');qs=g['questions']
        self.assertEqual([q['number'] for q in qs],[1,2,3])
        self.assertEqual([q['answer'] for q in qs],[1,2,0])
        self.assertNotIn('Shared data',qs[0]['stem'])
        self.assertIn('Shared data',qs[1]['context'])
        self.assertIn('__BOOK_ASSETS__/figure.png',qs[1]['context'])
        self.assertIn('Shared data',g['sheets']['mcq'])

    def test_lettered_frq_is_one_task_with_its_shared_stem(self):
        imp=self.fixture('''<body><h1>Atoms</h1><h2>PRACTICE EXERCISES</h2><h3>Free-Response</h3>
        <p>A common stem.</p><ol class="lower-alpha-paren0"><li>Part a</li><li>Part b</li></ol>
        <h2>Answers and Explanations</h2><h3>Free-Response</h3><ol class="lower-alpha-paren0"><li>Answer a</li><li>Answer b</li></ol></body>''')
        qs=imp.parse('OEBPS/chapter01.xhtml')['questions']
        self.assertEqual(len(qs),1)
        self.assertIn('A common stem.',qs[0]['context'])
        self.assertIn('Answer b',qs[0]['explanation'])
        self.assertIsNone(qs[0]['answer'])

    def test_mismatched_answers_never_shift_grading(self):
        imp=self.fixture('''<body><h1>Atoms</h1><h2>PRACTICE EXERCISES</h2><h3>Multiple-Choice</h3>
        <ol><li>One?<ol class="upper-latin"><li>A</li><li>B</li><li>C</li><li>D</li></ol></li></ol>
        <h2>Answers and Explanations</h2><h3>Multiple-Choice</h3><ol start="2"><li>(B) Reason</li></ol></body>''')
        q=imp.parse('OEBPS/chapter01.xhtml')['questions'][0]
        self.assertIsNone(q['answer']);self.assertTrue(imp.warnings)

    def test_markup_allowlist_blocks_scripts_events_and_external_images(self):
        imp=self.fixture('<body></body>')
        clean=imp.clean('<script>bad()</script><img src="https://bad.test/a.png" onerror="bad()"><b onclick="bad()">Safe</b><iframe src="file:///x"></iframe>','OEBPS/chapter01.xhtml')
        self.assertEqual(clean,'<b>Safe</b>')


if __name__=='__main__': unittest.main()
