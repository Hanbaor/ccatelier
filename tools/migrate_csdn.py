"""Faithfully import the owner's cached CSDN sources; never modify CSDN.

python -m pip install -r tools/migration-requirements.txt
python tools/migrate_csdn.py --cache .nijika-import
The cache contains profile-state.json, six <id>.html pages, and three exports.
"""
import argparse
import concurrent.futures
from datetime import datetime, timezone, timedelta
import hashlib
import json
from pathlib import Path
import re
import sys
from urllib.parse import urldefrag, urlparse, unquote

from bs4 import BeautifulSoup
from markdownify import MarkdownConverter
import requests

OWNER = 'https://blog.csdn.net/m0_68856756'
EXPORTS = {'165003255': 'LeetCode Hot100.md', '149880710': 'PyTorch基本操作实验.md',
           '154834561': '✨算法题目推荐 --- 分治（1）.md'}
IDS = {'124338392','124338541','124387071','124460411','124514677','131792879',*EXPORTS}
ROOT = Path(__file__).resolve().parents[1]


class FaithfulConverter(MarkdownConverter):
    def process_text(self, el, parent_tags=None):
        text=super().process_text(el,parent_tags)
        if not set(parent_tags or ()) & {'code','pre','_noformat'}:
            text=text.replace('<','&lt;').replace('>','&gt;')
        return text

    def convert_strong(self, el, text, parent_tags):
        # Inline HTML avoids ambiguous adjacent ** delimiters in CSDN exports.
        return '<strong>'+text+'</strong>' if text.strip() and '\n\n' not in text else text

    convert_b = convert_strong

    def convert_em(self, el, text, parent_tags):
        return '<em>'+text+'</em>' if text.strip() and '\n\n' not in text else text

    convert_i = convert_em


def normalize_export(text):
    def repair(line):
        line=line.replace('![在这里插入图片描述]', '![]').replace('![请添加图片描述]', '![]')
        if line.startswith(r'![!\[') and '外链图片转存失败' in line:
            direct=re.findall(r'https://i-blog\.csdnimg\.cn/direct/[0-9a-f]+\.(?:png|jpg|jpeg)',line)
            if len(direct)==1: return '![实验输出]('+direct[0]+')\n'
        return line
    return outside_fences(text,repair)


def sha(value):
    return hashlib.sha256(value if isinstance(value, bytes) else value.encode('utf-8')).hexdigest()


def outside_fences(text, transform):
    out, fence = [], None
    for line in text.splitlines(keepends=True):
        match = re.match(r'^\s{0,3}(`{3,}|~{3,})', line)
        if match:
            if fence is None:
                fence = match[1]
            elif match[1][0] == fence[0] and len(match[1]) >= len(fence):
                fence = None
            out.append(line)
        else:
            out.append(line if fence else transform(line))
    return ''.join(out)


def split_hot100(text, expected=100):
    posts, topic, current, fence = [], '', None, None
    for line in text.lstrip('\ufeff').splitlines(keepends=True):
        marker = re.match(r'^\s{0,3}(`{3,}|~{3,})', line)
        if marker:
            if fence is None: fence = marker[1]
            elif marker[1][0] == fence[0] and len(marker[1]) >= len(fence): fence = None
            if current: current['lines'].append(line)
            continue
        if not fence:
            question = re.match(r'^###\s+(\d+)\.\s+(.+?)\s*$', line)
            section = re.match(r'^##\s+(.+?)\s*$', line)
            if question:
                current = {'order':int(question[1]), 'title':question[2], 'topic':topic, 'lines':[]}
                posts.append(current)
                continue
            if section:
                topic = section[1]
                current = None
                continue
            if re.match(r'^<a id="(?:q-\d+|topic-\d+)"></a>\s*$', line):
                continue
        if current: current['lines'].append(line)
    if [p['order'] for p in posts] != list(range(1, expected+1)):
        raise ValueError('Expected an unbroken, unique sequence of %s questions' % expected)
    def links(line):
        line = re.sub(r'^####\s', '## ', line)
        line = line.replace('](#toc)', '](/series/hot100/)')
        line = re.sub(r'\]\(#q-(\d+)\)', lambda m: '](/hot100/%03d/)' % int(m[1]), line)
        line = re.sub(r'\]\(#(topic-\d+)\)', r'](/series/hot100/#\1)', line)
        return line
    for post in posts:
        body = ''.join(post.pop('lines')).strip()
        body = re.sub(r'\n---\s*$', '', body).strip()
        post['source_body_sha256'] = sha(body)
        body = outside_fences(body, links)
        post['difficulty'] = next((value for value in ['简单','中等','困难'] if re.search(r'\|\s*难度\s*\|[^\n]*'+value, body)), '')
        post['body'] = body + '\n'
    return posts


def article_markdown(html):
    soup = BeautifulSoup(html, 'html.parser')
    body = soup.select_one('#content_views')
    if body is None: raise ValueError('Missing full CSDN article body')
    for node in body.select('script,style,iframe,object,embed,button,input,form,.hljs-button,.pre-numbering'):
        node.decompose()
    for node in body.find_all(True):
        if node.name=='img' and node.get('alt') in ['在这里插入图片描述','请添加图片描述']:
            node['alt']=''
        for attr in list(node.attrs):
            if attr.lower().startswith('on') or attr in ['style','srcset']:
                del node[attr]
        if node.name == 'a' and not re.match(r'^(https?://|#|mailto:)', node.get('href','')):
            node.attrs.pop('href',None)
    # CSDN's encoded/manual heading IDs do not equal Hexo's slugged IDs.
    # Bind legacy TOC links to explicit local anchors, preferring visible labels.
    headings=[node for node in body.select('h1,h2,h3,h4,h5,h6') if node.get_text(strip=True)]
    labels={re.sub(r'\s+','',node.get_text()):i for i,node in enumerate(headings)}
    ids={unquote(node['id']):i for i,node in enumerate(headings) if node.get('id')}
    for link in body.select('a[href^="#"]'):
        label=re.sub(r'\s+','',link.get_text())
        index=labels.get(label,ids.get(unquote(link['href'][1:])))
        if index is not None: link['href']='#csdn-section-'+str(index+1)
    for i,heading in enumerate(headings):
        heading.insert_before('\n\nNJKANCHOR'+str(i+1)+'END\n\n')
    # Export code as verbatim fences, never flatten highlighted code into prose.
    def language(el):
        code = el.find('code')
        classes = code.get('class',[]) if code else el.get('class',[])
        return next((c.removeprefix('language-') for c in classes if c.startswith('language-')), '')
    result=FaithfulConverter(heading_style='ATX', bullets='-', code_language_callback=language).convert(str(body))
    return re.sub(r'NJKANCHOR(\d+)END',r'<a id="csdn-section-\1"></a>',result).strip()+'\n'


def inventory(cache):
    found = {}
    def walk(value):
        if isinstance(value, dict):
            url = value.get('url','')
            match = re.fullmatch(re.escape(OWNER)+r'/article/details/(\d+)',url) if isinstance(url,str) else None
            if match and value.get('title') and value.get('postTime'):
                found[match[1]] = {k:value[k] for k in ['title','url','postTime','updateTime'] if k in value}
            for v in value.values(): walk(v)
        elif isinstance(value,list):
            for v in value: walk(v)
    walk(json.loads((cache/'profile-state.json').read_text('utf-8')))
    if set(found) != IDS: raise ValueError('Owner profile article inventory does not match the nine observed originals')
    return found


def stamp(milliseconds):
    return datetime.fromtimestamp(milliseconds/1000, timezone(timedelta(hours=8))).strftime('%Y-%m-%d %H:%M:%S')


def frontmatter(data):
    return '---\n'+'\n'.join(k+': '+json.dumps(v,ensure_ascii=False) for k,v in data.items())+'\n---\n\n'


def image_urls(body):
    return list(dict.fromkeys(re.findall(r'!\[[^\]]*\]\((https?://[^\s)]+)',body)))


def download_image(url, cache):
    fetch_url = urldefrag(url)[0]
    host = urlparse(fetch_url).hostname or ''
    if not (host.endswith('.csdnimg.cn') or host.endswith('.csdn.net') or host == 'csdnimg.cn'):
        raise ValueError('Unreviewed image host: '+host)
    key = sha(fetch_url)[:20]
    directory = cache/'images'
    directory.mkdir(exist_ok=True)
    existing = list(directory.glob(key+'.*'))
    if existing:
        source = existing[0]
    else:
        response = requests.get(fetch_url, timeout=35)
        response.raise_for_status()
        mime = response.headers.get('content-type','').split(';')[0].lower()
        extensions = {'image/jpeg':'.jpg','image/png':'.png','image/gif':'.gif','image/webp':'.webp'}
        if mime not in extensions or not response.content: raise ValueError('Not a supported image: '+fetch_url)
        source = directory/(key+extensions[mime])
        source.write_bytes(response.content)
    return {'url':url,'source_url':fetch_url,'local':'/atelier/images/posts/'+source.name,
            'sha256':sha(source.read_bytes()),'bytes':source.stat().st_size,'cache':source}


def migrate(cache):
    records = inventory(cache)
    posts, manifest = [], {'owner':OWNER,'source_count':len(records),'sources':[],'assets':[],'posts':[]}
    series_intro = ''
    for article_id, record in records.items():
        local = EXPORTS.get(article_id)
        source = cache/(local or article_id+'.html')
        raw = source.read_text('utf-8-sig')
        source_info = {'id':article_id,'title':record['title'],'url':record['url'],
                       'source_file':source.name,'sha256':sha(source.read_bytes()),'destinations':[]}
        meta = {'title':record['title'],'date':stamp(record['postTime']),
                'updated':stamp(record.get('updateTime',record['postTime'])),
                'source_url':record['url'],'source_id':article_id,'author':'CC',
                'categories':['机器学习' if article_id=='149880710' else '算法'], 'tags':['PyTorch'] if article_id=='149880710' else ['算法学习']}
        if not local:
            original_date = BeautifulSoup(raw,'html.parser').select_one('meta[property="bytedance:published_time"]')
            if original_date:
                meta['date']=datetime.fromisoformat(original_date['content']).strftime('%Y-%m-%d %H:%M:%S')
                source_info['original_published']=original_date['content']
        source_info['profile_post_time']=stamp(record['postTime'])
        source_info['updated']=meta['updated']
        if article_id == '165003255':
            for post in split_hot100(raw):
                order = post['order']; file = 'source/_posts/hot100/%03d.md' % order
                entry = {**meta,'title':post['title'],'permalink':'hot100/%03d/' % order,
                         'series':'hot100','series_order':order,'topic':post['topic'],
                         'difficulty':post['difficulty'],'tags':['LeetCode',post['topic']]}
                posts.append({'file':file,'meta':entry,'body':post['body'],'source_body_sha256':post['source_body_sha256']})
                source_info['destinations'].append(entry['permalink'])
            # Keep the author's introduction and study guidance on the series itself.
            preface=raw[:raw.index('<a id="q-1">')]
            (cache/'hot100-preface.md').write_text(preface,'utf-8')
            opening=raw.split('<a id="toc">')[0].split('\n',1)[1].strip()
            guide=preface[preface.index('## 阅读说明'):].split('<a id="topic-01">')[0].strip().removesuffix('---').strip()
            series_intro=opening+'\n\n'+guide
        else:
            body = normalize_export(raw) if local else article_markdown(raw)
            if local:
                body = body.lstrip('\ufeff')
                # Markdown inside a bare HTML wrapper is not parsed by Marked.
                body = re.sub(r'^\s*</?div[^>]*>\s*$', '', body, flags=re.M)
                # These are the only two LaTeX expressions in these three exports.
                body = outside_fences(body,lambda line:line.replace('$𝑸^{T}$','𝑸<sup>T</sup>'))
            meta['permalink']='writing/csdn-'+article_id+'/'
            posts.append({'file':'source/_posts/csdn/'+article_id+'.md','meta':meta,'body':body})
            source_info['destinations'].append(meta['permalink'])
            if not local:
                soup=BeautifulSoup(raw,'html.parser').select_one('#content_views')
                source_info['code_blocks']=len(soup.select('pre'))
        manifest['sources'].append(source_info)
    if len(posts)!=108: raise ValueError('Expected 100 series entries and eight other articles')
    urls = list(dict.fromkeys(url for post in posts for url in image_urls(post['body'])))
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        assets = list(pool.map(lambda url:download_image(url,cache),urls))
    replacements = {asset['url']:asset['local'] for asset in assets}
    output = ROOT/'source/atelier/images/posts';output.mkdir(exist_ok=True)
    for asset in assets:
        (output/asset['cache'].name).write_bytes(asset['cache'].read_bytes())
        manifest['assets'].append({k:v for k,v in asset.items() if k!='cache'})
    old_path=ROOT/'docs/content/csdn-migration.json'
    old=json.loads(old_path.read_text('utf-8')) if old_path.exists() else {'posts':[]}
    old_hashes={post['file']:post['sha256'] for post in old['posts']}
    pending=[]
    for post in posts:
        body=post['body']
        for remote,local in replacements.items(): body=body.replace(remote,local)
        # Hardcoded CSDN inline colors clash with the reading palette; words stay intact.
        body=outside_fences(body,lambda line:re.sub(r'\s(?:style|color)="[^"]*"','',line))
        text=frontmatter(post['meta'])+body.strip()+'\n'
        filename=ROOT/post['file']
        if filename.exists() and sha(filename.read_bytes()) not in [sha(text),old_hashes.get(post['file'])]:
            raise ValueError('Refusing to overwrite manual edits: '+post['file'])
        pending.append((filename,text))
        manifest['posts'].append({'file':post['file'],'url':'/'+post['meta']['permalink'],'source_id':post['meta']['source_id'],
                                  'sha256':sha(text),'body_sha256':sha(body.strip()+'\n'),
                                  **({'source_body_sha256':post['source_body_sha256']} if 'source_body_sha256' in post else {})})
    for filename,text in pending:
        filename.parent.mkdir(exist_ok=True,parents=True);filename.write_text(text,'utf-8',newline='\n')
    data_path=ROOT/'source/_data/hot100.json'
    data_path.parent.mkdir(exist_ok=True,parents=True)
    data_path.write_text(json.dumps({'introduction':series_intro},ensure_ascii=False,indent=2)+'\n','utf-8')
    old_path.parent.mkdir(exist_ok=True,parents=True)
    old_path.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n','utf-8')
    print('Imported %s sources -> %s posts; localized %s image references.' % (len(records),len(posts),len(assets)))


if __name__=='__main__':
    if hasattr(sys.stdout,'reconfigure'):sys.stdout.reconfigure(encoding='utf-8')
    parser=argparse.ArgumentParser();parser.add_argument('--cache',type=Path,required=True)
    migrate(parser.parse_args().cache)
