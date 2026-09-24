"""Compare the generated site to cached originals after `hexo generate`."""
import argparse
import json
from pathlib import Path
import re
from urllib.parse import unquote
from bs4 import BeautifulSoup

ROOT=Path(__file__).resolve().parents[1]


def normalized_code(text):
    return text.replace('\r\n','\n').strip().expandtabs(2)


def rendered_codes(soup):
    return [normalized_code('\n'.join(line.get_text() for line in block.select('.line')))
            for block in soup.select('.article-body figure.highlight .code pre')]


def audit(cache, output):
    manifest=json.loads((ROOT/'docs/content/csdn-migration.json').read_text('utf-8'))
    assert manifest['source_count']==9 and len(manifest['posts'])==108
    pages={}
    image_count=0
    for post in manifest['posts']:
        soup=BeautifulSoup((output/post['url'].strip('/')/'index.html').read_text('utf-8'),'html.parser')
        pages[post['url']]=soup
        body=soup.select_one('.article-body')
        assert body is not None,post['url']
        ids={node.get('id') for node in soup.select('[id]')}
        for link in body.select('a[href^="#"]'):
            assert unquote(link['href'][1:]) in ids,(post['url'],link['href'])
        for img in body.select('img'):
            assert img['src'].startswith('/atelier/images/posts/'),img['src']
            assert (output/img['src'].lstrip('/')).is_file(),img['src']
            image_count+=1
        assert not body.select('script,iframe,object,embed,form,input')
        assert not any(attr.startswith('on') for node in body.find_all(True) for attr in node.attrs)
    code_count=0
    for record in manifest['sources']:
        raw=(cache/record['source_file']).read_text('utf-8-sig')
        if record['source_file'].endswith('.html'):
            source=BeautifulSoup(raw,'html.parser').select_one('#content_views')
            expected=[normalized_code((node.select_one('code') or node).get_text()) for node in source.select('pre')]
        else:
            expected=[normalized_code(code) for _,code in re.findall(r'^```([^\n]*)\n(.*?)^```\s*$',raw,re.M|re.S)]
        actual=[]
        for destination in record['destinations']:actual+=rendered_codes(pages['/'+destination])
        assert expected==actual,('Code differs from original',record['id'],len(expected),len(actual))
        code_count+=len(expected)
    index=BeautifulSoup((output/'series/hot100/index.html').read_text('utf-8'),'html.parser')
    links=[node['href'] for node in index.select('.series-track')]
    assert links==['/hot100/%03d/'%i for i in range(1,101)]
    assert len(index.select('.series-group'))==17
    assert image_count==54,('Expected all imported image occurrences',image_count)
    assert len(json.loads((output/'search.json').read_text('utf-8')))==109
    print(json.dumps({'sources':9,'imported_posts':108,'total_posts':109,'hot100':100,
                      'topics':17,'image_occurrences':image_count,'matching_code_blocks':code_count,
                      'broken_article_anchors':0,'unsafe_article_nodes':0},indent=2))


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--cache',type=Path,required=True)
    parser.add_argument('--output',type=Path,default=ROOT/'public')
    args=parser.parse_args();audit(args.cache,args.output)
