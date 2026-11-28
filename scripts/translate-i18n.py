"""Translate extracted chapter blocks with the DeepSeek API.

Input is the TSV that `build-i18n.py --extract` writes (index, tag, Chinese key,
optional inner markup). Output is content/i18n/<lang>/<chapter>.json keyed by
the block index, which is exactly what build-i18n.py merges back. Idempotent:
an existing translation is kept unless --force is passed.

Usage:
    DEEPSEEK_API_KEY=... python3 scripts/translate-i18n.py --lang en --chapters 20,35,36,37,38,39,40,41
"""
from __future__ import annotations

import argparse
import json
import os
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / '.i18n-source'
TARGET = ROOT / 'content' / 'i18n'
LANG_NAMES = {'en': 'English', 'es': 'Spanish'}
BATCH_CHARS = 1800
BATCH_ROWS = 16


def read_rows(chapter: int) -> list[dict]:
    path = SOURCE / f'chapter-{chapter}.tsv'
    rows = []
    for line in path.read_text(encoding='utf-8').splitlines():
        if not line.strip():
            continue
        index, tag, key, markup = (line.split('\t') + ['', ''])[:4]
        rows.append({'i': int(index), 'tag': tag, 'key': key, 'markup': markup})
    return rows


def batches(rows: list[dict]):
    current, chars = [], 0
    for row in rows:
        if current and (chars + len(row['key']) > BATCH_CHARS or len(current) >= BATCH_ROWS):
            yield current
            current, chars = [], 0
        current.append(row)
        chars += len(row['key'])
    if current:
        yield current


def call(api_key: str, base: str, model: str, language: str, items: list[dict]) -> dict[str, str]:
    numbered = [{'index': row['i'], 'text': row['key'], 'keeps_markup': bool(row['markup'])} for row in items]
    prompt = (
        f'你是专业的技术文档译者。把下面 JSON 数组里的每一条中文翻译成{LANG_NAMES[language]}。\n'
        '要求：\n'
        '1. 逐条翻译，保持编号，只返回一个 JSON 对象，键是 index（字符串），值是译文。\n'
        '2. 保留代码标识、命令、URL、模型名、版本号、数字与单位，不翻译它们。\n'
        '3. keeps_markup 为 true 的条目，译文里要保留原有的 HTML 标签与顺序。\n'
        '4. 语气与原文一致，不要扩写、不要加解释、不要合并条目。\n'
        '5. 只输出 JSON，不要 Markdown 代码块。\n\n'
        + json.dumps(numbered, ensure_ascii=False)
    )
    payload = json.dumps({
        'model': model,
        'temperature': 0,
        'messages': [{'role': 'user', 'content': prompt}],
        'response_format': {'type': 'json_object'},
    }).encode('utf-8')
    request = urllib.request.Request(
        base.rstrip('/') + '/chat/completions', data=payload,
        headers={'Authorization': f'Bearer {api_key}', 'Content-Type': 'application/json'})
    with urllib.request.urlopen(request, timeout=120) as response:
        body = json.loads(response.read().decode('utf-8'))
    content = body['choices'][0]['message']['content']
    parsed = json.loads(content)
    return {str(key): str(value) for key, value in parsed.items()}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--lang', required=True, choices=sorted(LANG_NAMES))
    parser.add_argument('--chapters', required=True)
    parser.add_argument('--force', action='store_true')
    args = parser.parse_args()

    api_key = os.getenv('DEEPSEEK_API_KEY', '').strip()
    base = os.getenv('DEEPSEEK_BASE_URL', 'https://api.deepseek.com/v1')
    model = os.getenv('DEEPSEEK_MODEL', 'deepseek-chat')
    if not api_key:
        raise SystemExit('DEEPSEEK_API_KEY is required')

    folder = TARGET / args.lang
    folder.mkdir(parents=True, exist_ok=True)
    for chapter in [int(part) for part in args.chapters.split(',') if part.strip()]:
        rows = read_rows(chapter)
        target = folder / f'chapter-{chapter}.json'
        existing = {}
        if target.exists() and not args.force:
            existing = json.loads(target.read_text(encoding='utf-8'))
        pending = [row for row in rows if str(row['i']) not in existing]
        print(f'chapter {chapter}: {len(rows)} blocks, {len(pending)} to translate')
        for batch in batches(pending):
            for attempt in range(4):
                try:
                    translated = call(api_key, base, model, args.lang, batch)
                    break
                except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, KeyError) as error:
                    print(f'  retry {attempt + 1}: {error}')
                    time.sleep(2 * (attempt + 1))
            else:
                raise SystemExit(f'chapter {chapter}: batch starting at {batch[0]["i"]} failed')
            for row in batch:
                value = translated.get(str(row['i']))
                if value:
                    existing[str(row['i'])] = value
            target.write_text(json.dumps(dict(sorted(existing.items(), key=lambda kv: int(kv[0]))),
                                         ensure_ascii=False, indent=1) + '\n',
                              encoding='utf-8', newline='\n')
            print(f'  translated {len(batch)} blocks')
        missing = [row['i'] for row in rows if str(row['i']) not in existing]
        if missing:
            print(f'  WARNING still missing: {missing[:10]}')
        else:
            print(f'  complete: {target.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
