import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('migration', Path(__file__).parents[1] / 'tools/migrate_csdn.py')
migration = importlib.util.module_from_spec(spec)
spec.loader.exec_module(migration)


class MigrationTests(unittest.TestCase):
    def test_split_uses_real_headings_and_preserves_code(self):
        text = '''# Hot100
## 哈希
<a id="q-1"></a>
### 01. 两数之和
LeetCode #1
#### 代码实现
```cpp
// [返回目录](#toc)
### 88. inside code
```
[返回目录](#toc)
---
<a id="topic-02"></a>
## 双指针
<a id="q-2"></a>
### 02. 移动零
LeetCode #283
#### 题目要求
参见 [第一题](#q-1)
'''
        posts = migration.split_hot100(text, expected=2)
        self.assertEqual([p['order'] for p in posts], [1, 2])
        self.assertEqual([p['topic'] for p in posts], ['哈希', '双指针'])
        self.assertIn('### 88. inside code', posts[0]['body'])
        self.assertIn('// [返回目录](#toc)', posts[0]['body'])
        self.assertIn('[返回目录](/series/hot100/)', posts[0]['body'])
        self.assertIn('[第一题](/hot100/001/)', posts[1]['body'])
        self.assertNotIn('## 双指针', posts[0]['body'])

    def test_missing_or_duplicate_question_fails_before_writing(self):
        with self.assertRaises(ValueError):
            migration.split_hot100('## 哈希\n### 01. A\nbody\n### 01. B\nbody', expected=2)

    def test_source_html_keeps_code_and_removes_active_content(self):
        html = '<div id="content_views"><h2>正文</h2><p>保留文字</p><script>bad()</script><pre><code class="language-cpp">if (a &lt; b) return a;</code></pre><img src="https://example.com/a.png" onerror="bad()"></div>'
        result = migration.article_markdown(html)
        self.assertIn('if (a < b) return a;', result)
        self.assertIn('```cpp', result)
        self.assertIn('保留文字', result)
        self.assertNotIn('bad()', result)

    def test_cpp_templates_in_prose_remain_visible(self):
        result = migration.article_markdown('<div id="content_views"><p>使用 vector&lt;int&gt;::iterator 和 #include &lt;algorithm&gt;</p></div>')
        self.assertIn('vector&lt;int&gt;::iterator', result)
        self.assertIn('&lt;algorithm&gt;', result)

    def test_malformed_export_image_uses_its_intended_direct_image(self):
        text = r'![!\[外链图片转存失败\](https://img-home.csdnimg.cn/error.png?origin_url=file](https://i-blog.csdnimg.cn/direct/ee5f18a179a54b94b0d3738a909bd9e4.png)'
        result = migration.normalize_export(text)
        self.assertEqual(migration.image_urls(result), ['https://i-blog.csdnimg.cn/direct/ee5f18a179a54b94b0d3738a909bd9e4.png'])


if __name__ == '__main__':
    unittest.main()
