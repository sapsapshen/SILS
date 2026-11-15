# 生产级考核整改记录（2026-11-14 报告）

来源：`MyMAIC与超智学习空间-生产级考核报告-2026-11-14.html` 第四章与 5.2 节。
本文记录 **超智学习空间 / ms-cookbook-3langs 仓库内**做了什么、验收结果，
以及仍需部署/运营完成的事项。未改数据库结构，未改动上游章节的既有内容。

## 一、已修复（代码/内容/部署模板）

| 报告项 | 级别 | 处理 | 落点 |
| --- | --- | --- | --- |
| 仅 HTTP，Cookie 无 `Secure` | P0 | 增加生产 nginx 模板与 `FORCE_HTTPS`；`APP_BASE_URL=https` 时 SessionMiddleware 自动给 `purplebook_session` 加 `Secure`；HTTPS 下发 HSTS | `deploy/nginx.conf`、`deploy/README.md`、`app.py`、Dockerfile |
| uvicorn 直接暴露 8899 | P0 | 文档要求应用只监听 `127.0.0.1:8899`（容器发布到回环）；nginx 终结 TLS；Dockerfile 加 `--proxy-headers` | `deploy/README.md`、`Dockerfile` |
| 第 24 章 pending，正文是占位句 | P1 | 补成完整章节：H3 能力边界、拍摄单、六步流程、接缝、成本、许可与清单；状态改为 ready | `content/source-html/chapter-24.html`、`content/manifest.json`、生成的 `content/chapters/chapter-24.md` 与 `assets/content.js` |
| 第 24 章没有练习 | P1 | 新增 3 道三语练习（判断、反思、代码），练习总数 95 → 98 | `content/exercises/{zh,en,es}/chapter-24.json`、`content/exercises/manifest.json`、`assets/exercises.js` |
| 讨论 ID 指向 chapter-23 | P1（报告推断） | 复核后**不是缺陷**：显示第 24 章沿用原稿的稳定 ID `chapter-23`，显示第 25 章才占用 `chapter-24`；改成 chapter-24 会与第 25 章冲突。保留并在此说明 | `content/manifest.json` |
| 无 favicon、robots、sitemap | P1 | `/favicon.ico` 返回真实 SVG；新增 `/robots.txt`、`/sitemap.xml` | `app.py` |
| 缺少 CSP、点击劫持防护、HSTS | P1 | 统一下发 CSP（含 Pyodide 所需的 `wasm-unsafe-eval`）、`frame-ancestors`（默认允许 ModelScope Studio 内嵌）、`X-Frame-Options: SAMEORIGIN` 兜底、nosniff、Referrer-Policy、Permissions-Policy、COOP；HTTPS 下 HSTS | `app.py`、`tests/test_production_hardening.py` |
| 404 统一返回 FastAPI JSON | P1 | 非 `/api/` 404 返回站点自己的 `404.html`；API 保持 JSON | `app.py`、`404.html` |
| `/api/wishes/` 307 到绝对 HTTP 地址 | P1 | 同主机 3xx 的 `Location` 改写为相对路径；HTTP→HTTPS 重定向除外（保持绝对 https，避免循环） | `app.py` |
| 第六篇标题使用繁体「特別」 | P2 | 改为「特别」并重新生成站点数据 | `content/manifest.json`、`assets/content.js` |
| 首页仍宣传「第 24 章待更新」 | P2 | 练习库文案与三语文案改为「已上线」 | `index.html`、`assets/locale/{zh,en,es}.js` |
| 上游 Apache-2.0 署名不够显式 | P2 | 新增 `NOTICE`；README 中英文许可段补上游来源；首页页脚固定显示「教材来源 ModelScope ms-cookbook · Apache-2.0」 | `NOTICE`、`README*.md`、`index.html` |
| 登录页内联脚本与严格 CSP 冲突 | 补充 | 抽出为 `assets/login.js`，使 `script-src 'self'` 真正可执行 | `login.html`、`assets/login.js` |
| 部署脚本未同步新页面 | 补充 | `deploy-modelscope.mjs` 的同步列表加入 `login.html`、`404.html`、`NOTICE` | `scripts/deploy-modelscope.mjs` |

## 二、验收结果

```text
pytest tests                              176 passed
scripts/test_chapter_markdown.py          10 passed
scripts/build-content.py --check          Verified 35 chapters, 380 images, 12 attachments
scripts/build-i18n.py --check             current（chapter-24 en/es 45/45，完整）
scripts/check-site.mjs                    PASS 35 chapters, 98 exercises
scripts/test_exercises.py                 PASS 98 exercises across 35 chapters, 3 languages
scripts/build-exercises.py --check        Verified 98 exercises
scripts/check_exercise_references.py      PASS 138 executable references
scripts/check_regex_parity.py             PASS 810 pairs
node scripts/test-i18n.cjs                 4 passed
node scripts/test-reader-copy.cjs          9 passed
node scripts/test-exercise-wiring.cjs      23 passed
node scripts/test-asset-loading.cjs        14 passed
```

实际响应抽查（本地 uvicorn）：

```text
GET /                   cache-control: no-cache
                        content-security-policy: default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; ...
                        x-frame-options: DENY; x-content-type-options: nosniff
GET /no-such-page       404 text/html，包含站点自己的 404 文案
GET /api/nope           404 application/json
GET /favicon.ico        200 image/svg+xml
GET /api/wishes/        307 location: /api/wishes（相对地址）
GET /robots.txt         含 Sitemap: <APP_BASE_URL>/sitemap.xml
```

## 三、必须由部署/运营完成

1. **DNS + 证书**：为学习空间绑定正式域名（模板用 `learn.alphalio.cn`），
   按 `deploy/README.md` 签发证书。
2. **端口收敛**：8899/7860 只绑定回环；安全组只放行 80/443。
3. **生产环境变量**：`APP_BASE_URL=https://...`、`FORCE_HTTPS=1`、
   强随机 `SESSION_SECRET`；否则 Cookie 不会带 `Secure`。
4. **社区冷启动**：愿望池仍为空。建议运营账号先发 10–20 条真实征集并逐条答复，
   不要用脚本伪造用户内容。
5. **分发**：GitHub 仓库 homepage、ModelScope、微信等渠道指向正式域名；
   当前公开仓库仍未设置 homepage。
6. **OAuth**：仍为关闭状态。若继续关闭，登录页应明确说明「本地账号可用，
   第三方登录未开放」；如需开启，配置 `OAUTH_CLIENT_ID` / `OAUTH_CLIENT_SECRET`。
7. **nginx 升级**：线上 1.18.0 已停止安全维护；本模板兼容它，但建议升级。

## 四、内容说明

第 24 章的新增内容基于本书第 21 章已有的实测数据（RTX 4090/5090 的生成耗时、
H3-Base 768p/4–15 秒/24fps、Context-IR 与 2K 管线未完整开放），没有编造新的
模型能力或跑分。练习中的代码题只计算段数、接缝与 GPU 分钟，不依赖任何在线
服务，可在现有 Pyodide 沙箱中判分。

第 25 章及后续章节的 `discussionId` 保持原稿映射不变，避免把已有讨论迁走。
