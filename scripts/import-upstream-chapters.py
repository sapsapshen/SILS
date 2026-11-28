"""Import chapters the upstream book added after this snapshot was taken.

The local book is numbered 1-35 from the 2026-09-20 snapshot. Upstream has since
renumbered (1-10 unchanged, 11-19 => 13-21, 20 => 24, 21-31 => 25-35, 32/33 =>
39/37, 34/35 => 40/41) and added six new articles. Renumbering this book would
scramble every reader's stored progress and comment thread, so the new articles
are appended as 36-41 in their own part, each carrying `upstreamNumber` so the
"原文 / 参与改进" links still land on the right upstream file.

Usage: python3 scripts/import-upstream-chapters.py
"""
from __future__ import annotations

import json
import re
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = 'https://raw.githubusercontent.com/modelscope/ms-cookbook/main'
NEW_PART = {'title': '第九篇　上游新增', 'shortTitle': '上游新增'}
# local number -> upstream number, in the order they are appended.
PLAN = [(36, 11), (37, 12), (38, 22), (39, 23), (40, 28), (41, 38)]


def fetch(url: str) -> bytes:
    request = urllib.request.Request(url, headers={'User-Agent': 'sils-import/1.0'})
    with urllib.request.urlopen(request, timeout=60) as response:
        return response.read()


def main() -> None:
    manifest_path = ROOT / 'content' / 'manifest.json'
    manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    known = {c['number'] for c in manifest['chapters']}
    if len(manifest['parts']) == 8:
        manifest['parts'].append(NEW_PART)
    part_index = len(manifest['parts']) - 1

    for local, upstream in PLAN:
        url = f'{RAW}/content/source-html/chapter-{upstream:02d}.html'
        text = fetch(url).decode('utf-8')
        # Images and attachments are referenced as ../../assets/<dir>/<file>;
        # the build strips the leading ../../ and asserts the file is in the
        # repo, so everything referenced has to be downloaded first.
        for source in sorted(set(re.findall(r'(?:src|href)="(\.\./\.\./assets/[^"]+)"', text))):
            relative = source[len('../../'):]
            target = ROOT / relative
            if target.exists():
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(fetch(f'{RAW}/{relative}'))
            print(f'  asset {relative} ({target.stat().st_size // 1024} KB)')
        # The author line ships a 20px GitHub icon. It is chrome, not article
        # art, and an <img> without class="article-image" trips the payload
        # invariant that every article image carries an intrinsic size.
        text = re.sub(r'<img[^>]*class="author-link-icon"[^>]*>', '', text)
        target = ROOT / 'content' / 'source-html' / f'chapter-{local}.html'
        target.write_text(text, encoding='utf-8', newline='\n')
        title = re.search(r'<h1>(.*?)</h1>', text, re.S)
        entry = {
            'number': local,
            'title': re.sub(r'<[^>]+>', '', title.group(1)).strip() if title else f'第 {local} 章',
            'partIndex': part_index,
            'file': f'source-html/chapter-{local}.html',
            'upstreamNumber': upstream,
            'status': 'ready',
            'discussionId': f'chapter-{local}',
        }
        existing = next((c for c in manifest['chapters'] if c['number'] == local), None)
        if existing:
            existing.update(entry)
        else:
            manifest['chapters'].append(entry)
        print(f'chapter {local} <- upstream {upstream}: {entry["title"]}')

    manifest['sourceUpdated'] = '2026-11-28'
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n',
                             encoding='utf-8', newline='\n')


if __name__ == '__main__':
    main()
