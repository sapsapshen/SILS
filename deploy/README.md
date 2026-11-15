# 超智学习空间生产部署手册（2026-11-14 审计整改）

对应考核报告 4.3 与 5.2 节。目标：把 `uvicorn 直接暴露 8899 + 纯 HTTP`
收敛为「正式域名 + HTTPS + 回环应用端口」，并补齐安全头、favicon、
robots、sitemap 与友好的 404。

## 0. 目标状态

| 项 | 目标值 |
| --- | --- |
| 正式域名 | `https://learn.alphalio.cn`（可替换为团队主域名） |
| 应用监听 | `127.0.0.1:8899`（容器内 7860，宿主发布到 `127.0.0.1:8899`） |
| 公网端口 | 仅 80/443 |
| `APP_BASE_URL` | `https://learn.alphalio.cn` |
| `FORCE_HTTPS` | `1`（仅在上面的代理/TLS 前提下开启） |
| Cookie | `purplebook_session` 带 `Secure`（由 `APP_BASE_URL=https` 决定） |

## 1. 环境变量

```dotenv
APP_BASE_URL=https://learn.alphalio.cn
FORCE_HTTPS=1
SESSION_SECRET=<至少 32 字节随机值>
DATABASE_URL=postgresql://user:pass@127.0.0.1:5432/purplebook
ALLOWED_ORIGINS=https://learn.alphalio.cn
# 可选：开启 OAuth 登录
OAUTH_CLIENT_ID=
OAUTH_CLIENT_SECRET=
# 可选：练习 AI 评分
EXERCISE_LLM_KEY=
```

注意：

- `APP_BASE_URL` 必须是 **https + 无路径**。应用启动时会拒绝公网 http origin
  （`RuntimeError: Public OAuth deployments require HTTPS`），这是有意的。
- `FORCE_HTTPS=1` 依赖 `X-Forwarded-Proto` 或 uvicorn 直接终止 TLS。
  如果直接以明文跑在 8899 上又开了它，会形成重定向循环。
- `SESSION_SECRET` 不落仓库；容器/系统环境注入。

## 2. 启动应用

直接跑：

```bash
APP_BASE_URL=https://learn.alphalio.cn FORCE_HTTPS=1 \
  ./.venv/bin/python -m uvicorn app:app \
  --host 127.0.0.1 --port 8899 --no-access-log \
  --proxy-headers --forwarded-allow-ips 127.0.0.1
```

Docker（浏览器入口只能是 nginx）：

```bash
docker build -t purplebook .
docker run -d --name purplebook --restart unless-stopped \
  -p 127.0.0.1:8899:7860 \
  --env-file .env.production \
  purplebook
```

验证应用只在回环：

```bash
curl -I http://127.0.0.1:8899/                 # 200
curl -I http://<公网IP>:8899/                  # 应连接失败
```

## 3. 证书与 nginx

```bash
sudo mkdir -p /var/www/certbot
sudo certbot certonly --webroot -w /var/www/certbot -d learn.alphalio.cn \
  --email support@alphalio.cn --agree-tos --no-eff-email

sudo cp deploy/nginx-limits.conf /etc/nginx/conf.d/00-purplebook-limits.conf
sudo cp deploy/nginx.conf        /etc/nginx/conf.d/purplebook.conf
sudo nginx -t && sudo systemctl reload nginx
```

证书自动续期：

```bash
sudo systemctl enable --now certbot.timer
sudo certbot renew --dry-run
```

## 4. 安全与缓存行为

- `app.py` 的响应中间件统一下发：CSP（`script-src 'self' 'wasm-unsafe-eval'`，
  Pyodide 需要 WebAssembly 编译）、`frame-ancestors`（默认允许
  `modelscope.cn` / `www.modelscope.cn`，因为官方 Studio 用内嵌方式展示）、
  `X-Frame-Options: SAMEORIGIN` 兜底、`nosniff`、Referrer-Policy、
  Permissions-Policy、COOP；HTTPS 下再发 HSTS。
  自建站点如不需要 Studio 内嵌，可设 `FRAME_ANCESTORS="'self'"`（或 `'none'`）。
- 同主机 3xx 的绝对 `Location` 会被改写为相对路径，避免
  `http://host/api/wishes` 在 HTTPS 站点上造成协议降级。
- `/favicon.ico` 返回真实 SVG（`image/svg+xml`），不再是 FastAPI JSON 404。
- `/robots.txt`、`/sitemap.xml` 已提供；站点只有一个可抓取 URL（hash 路由）。
- 非 `/api/` 的 404 返回站点自己的 `404.html`；`/api/` 仍返回 JSON。

## 5. 上线验收

```bash
curl -sI https://learn.alphalio.cn/ | grep -Ei 'strict-transport|content-security|x-frame|x-content-type|referrer'
curl -sI https://learn.alphalio.cn/favicon.ico | head -3
curl -s  https://learn.alphalio.cn/robots.txt
curl -s  https://learn.alphalio.cn/sitemap.xml
curl -sI http://learn.alphalio.cn/ | head -1     # 308 -> https
curl -s  https://learn.alphalio.cn/api/session | head -c 300
# 期望：响应 Set-Cookie 带 Secure；登录后 Cookie 不应在 http:// 下出现
curl -s  https://learn.alphalio.cn/no-such-page | grep -o '这一页不在书里'
```

## 6. 仍需运营完成

- DNS、证书、防火墙与 nginx 版本升级（线上 1.18.0 已停止安全维护）。
- 社区冷启动：愿望池目前为空。建议运营账号先发 10–20 条真实、
  可执行的内容征集并逐条答复；不要用脚本伪造用户愿望。
- GitHub 仓库 homepage 与社交渠道指向正式域名；当前仓库未设置 homepage。
- OAuth 登录若继续关闭，需要在页面上说明「本地账号可用，第三方登录未开放」。
- 第 24 章已补齐正文与练习；后续仍建议按季度复核模型版本与实测数据。
