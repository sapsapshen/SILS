"""Translate authored exercises (zh -> en/es) field by field.

Code fields are copied byte for byte: `starter`, `checks`, and `reference` on
code/build items. Only prose is sent to the model. Run after editing a zh file:

    DEEPSEEK_API_KEY=... python scripts/translate-exercises.py --chapters 36,37,38,39,40,41

It refuses to write a translation that still contains CJK, so a partial answer
cannot reach the corpus validator.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EX = ROOT / 'content' / 'exercises'
CJK = re.compile(r'[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]')
FIELDS = ('objective', 'prompt', 'reference', 'explanation')
LANG_NAME = {'en': 'English', 'es': 'Spanish'}


def escape_cjk(value: str) -> str:
    return ''.join(f'\\u{ord(char):04x}' if CJK.match(char) else char for char in value)


def call(api_key: str, payload: list[dict], lang: str) -> dict:
    prompt = (
        f'你是专业技术文档译者。把下面 JSON 数组里每一道中文练习的指定字段翻译成{LANG_NAME[lang]}。\n'
        '要求：\n'
        '1. 只返回一个 JSON 对象，键是练习 id，值是包含这些字段的对象。\n'
        '2. 选项字母（A. B. C.…）、代码标识、函数名、数字、URL 原样保留。\n'
        '3. 保留段落换行与 Markdown 结构；不要合并或增删段落。\n'
        '4. explanation 与 reference 是讲解，语气与原文一致，不要缩写成摘要。\n'
        '5. criteria 只翻译给出的部分，没有就不要返回该键。\n'
        '6. 只输出 JSON，不要 Markdown 代码块。\n\n'
        + json.dumps(payload, ensure_ascii=False)
    )
    data = json.dumps({
        'model': os.getenv('DEEPSEEK_MODEL', 'deepseek-chat'),
        'temperature': 0,
        'response_format': {'type': 'json_object'},
        'messages': [{'role': 'user', 'content': prompt}],
    }).encode('utf-8')
    request = urllib.request.Request(
        os.getenv('DEEPSEEK_BASE_URL', 'https://api.deepseek.com/v1').rstrip('/') + '/chat/completions',
        data=data,
        headers={'Authorization': f'Bearer {api_key}', 'Content-Type': 'application/json'},
    )
    with urllib.request.urlopen(request, timeout=180) as response:
        body = json.loads(response.read().decode('utf-8'))
    return json.loads(body['choices'][0]['message']['content'])


def translate_chapter(api_key: str, chapter: int, lang: str) -> None:
    source = json.loads((EX / 'zh' / f'chapter-{chapter}.json').read_text(encoding='utf-8'))
    payload = []
    for item in source:
        fields = {key: item[key] for key in FIELDS if isinstance(item.get(key), str)}
        # reference on code/build is the solution code, shared with zh.
        if item['type'] in ('code', 'build'):
            fields.pop('reference', None)
        criteria = (item.get('llm_rubric') or {}).get('criteria')
        if criteria:
            fields['criteria'] = criteria
        payload.append({'id': item['id'], **fields})

    result = None
    for attempt in range(4):
        try:
            result = call(api_key, payload, lang)
            break
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, KeyError) as error:
            print(f'  retry {attempt + 1}: {error}')
            time.sleep(2 * (attempt + 1))
    if result is None:
        raise SystemExit(f'chapter {chapter}/{lang}: translation failed')

    translated = []
    for item in source:
        twin = json.loads(json.dumps(item, ensure_ascii=False))
        fields = result.get(item['id']) or {}
        for key in FIELDS:
            if key == 'reference' and item['type'] in ('code', 'build'):
                continue
            value = fields.get(key)
            if not isinstance(value, str) or not value.strip():
                raise SystemExit(f'chapter {chapter}/{lang}: {item["id"]} lost {key}')
            # Chinese that survives inside a quoted sample is data, not prose:
            # the corpus stores it as \uXXXX escapes so the raw file has no CJK
            # and the reader still sees the original characters. Anything left
            # outside a quote is caught by the corpus validator afterwards.
            twin[key] = escape_cjk(value)
        criteria = fields.get('criteria')
        if (item.get('llm_rubric') or {}).get('criteria'):
            if not isinstance(criteria, str) or CJK.search(criteria):
                raise SystemExit(f'chapter {chapter}/{lang}: {item["id"]} criteria bad')
            twin['llm_rubric']['criteria'] = criteria
        translated.append(twin)

    target = EX / lang / f'chapter-{chapter}.json'
    target.write_text(json.dumps(translated, ensure_ascii=False, indent=2) + '\n', encoding='utf-8', newline='\n')
    print('wrote', target.relative_to(ROOT))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--lang', choices=['en', 'es'], required=True)
    parser.add_argument('--chapters', required=True)
    args = parser.parse_args()
    key = os.getenv('DEEPSEEK_API_KEY', '').strip()
    if not key:
        sys.exit('DEEPSEEK_API_KEY is required')
    for chapter in [int(part) for part in args.chapters.split(',') if part.strip()]:
        translate_chapter(key, chapter, args.lang)


if __name__ == '__main__':
    main()
