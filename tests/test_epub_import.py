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
    def fixture(self, html, images=None):
        buf=io.BytesIO()
        with zipfile.ZipFile(buf,'w') as z:
            z.writestr('OEBPS/chapter01.xhtml','<meta charset="utf-8">'+html)
            z.writestr('OEBPS/images/figure.png',b'fixture')
            for name, data in (images or {}).items():
                z.writestr('OEBPS/images/'+name,data)
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
        image=MOD.BeautifulSoup(qs[1]['context'],'html.parser').find('img')
        self.assertEqual(imp.images[image['src'].split('/')[-1]],'OEBPS/images/figure.png')
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

    def test_numbered_shared_context_is_complete_and_does_not_leak(self):
        options='<ol class="upper-latin"><li>A</li><li>B</li><li>C</li><li>D</li></ol>'
        for separator in ('-', '–', ' to ', ' and '):
            with self.subTest(separator=separator):
                imp=self.fixture(f'''<body><h1>Atoms</h1><h2>Practice Exercises</h2>
                <p>Questions 1{separator}2 refer to the following experiment.</p>
                <table><tr><td>Shared rates</td></tr></table><ol>
                <li>First?{options}</li><li>What is the reaction order?{options}</li>
                <li>Unrelated data?{options}</li></ol>
                <h2>Answers and Explanations</h2><ol><li>(A) One</li><li>(B) Two</li><li>(C) Three</li></ol></body>''')
                qs=imp.parse('OEBPS/chapter01.xhtml')['questions']
                self.assertIn('Shared rates',qs[0]['context'])
                self.assertIn('Shared rates',qs[1]['context'])
                self.assertEqual(qs[2]['context'],'')
                self.assertEqual([q['answer'] for q in qs],[0,1,2])

    def test_images_have_browser_safe_unique_names_and_reuse_the_same_source(self):
        imp=self.fixture('<body></body>',{'Figure 1.png':b'spaced','extra/figure.png':b'other'})
        html='<img src="images/Figure 1.png"><img src="images/figure.png"><img src="images/extra/figure.png"><img src="images/Figure 1.png">'
        clean=MOD.BeautifulSoup(imp.clean(html,'OEBPS/chapter01.xhtml'),'html.parser')
        sources=[img['src'] for img in clean.find_all('img')]
        self.assertEqual(len(set(sources)),3)
        self.assertEqual(sources[0],sources[3])
        for src in sources:
            self.assertRegex(src,r'^__BOOK_ASSETS__/[\w.-]+\.(png|jpe?g|gif|webp)$')
        self.assertEqual([imp.z.read(imp.images[src.split('/')[-1]]) for src in sources],
                         [b'spaced',b'fixture',b'other',b'spaced'])
        self.assertEqual(imp.clean(html,'OEBPS/chapter01.xhtml'),str(clean))
        self.assertFalse(imp.warnings)

    def test_separate_lettered_frqs_keep_their_own_answers(self):
        imp=self.fixture('''<body><h1>Atoms</h1><h2>Practice Exercises</h2><h3>Free-Response</h3>
        <p>First stem</p><ol class="lower-alpha"><li>First part</li></ol>
        <p>Second stem</p><ol class="lower-alpha"><li>Second part</li></ol>
        <h2>Answers and Explanations</h2><h3>Free-Response</h3>
        <ol class="lower-alpha"><li>First answer</li></ol>
        <ol class="lower-alpha"><li>Second answer</li></ol></body>''')
        qs=imp.parse('OEBPS/chapter01.xhtml')['questions']
        self.assertEqual([q['number'] for q in qs],[1,2])
        for q, word in zip(qs,('First','Second')):
            self.assertIn(word+' stem',q['context'])
            self.assertIn(word+' part',q['stem'])
            self.assertIn(word+' answer',q['explanation'])
        self.assertFalse(imp.warnings)


if __name__=='__main__': unittest.main()
