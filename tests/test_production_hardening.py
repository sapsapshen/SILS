"""生产化加固：安全头、HTTPS 行为、404 语义与站点资产。"""
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app import create_app

ROOT = Path(__file__).resolve().parent.parent
BASE = 'http://127.0.0.1:7860'


def make_app(tmp_path, monkeypatch, base=BASE, **env):
    monkeypatch.setenv('APP_BASE_URL', base)
    for name in ('OAUTH_CLIENT_ID', 'OAUTH_CLIENT_SECRET', 'DATABASE_URL',
                 'LOCAL_ADMIN_EMAIL', 'LOCAL_ADMIN_PASSWORD'):
        monkeypatch.delenv(name, raising=False)
    for name, value in env.items():
        monkeypatch.setenv(name, value)
    return create_app(tmp_path)


@pytest.fixture
def site(tmp_path, monkeypatch):
    return make_app(tmp_path, monkeypatch)


def client(site, base=BASE):
    return TestClient(site, base_url=base)


def test_security_headers_are_present_on_pages(site):
    response = client(site).get('/')
    assert response.headers['x-content-type-options'] == 'nosniff'
    assert response.headers['x-frame-options'] == 'SAMEORIGIN'
    assert response.headers['referrer-policy'] == 'strict-origin-when-cross-origin'
    assert 'camera=()' in response.headers['permissions-policy']
    csp = response.headers['content-security-policy']
    assert "default-src 'self'" in csp
    # The official ModelScope Studio deployment embeds the app, so the
    # allowlist must name it while still excluding arbitrary sites.
    assert 'frame-ancestors' in csp
    assert 'https://modelscope.cn' in csp
    assert 'https://www.modelscope.cn' in csp
    assert "object-src 'none'" in csp
    # Pyodide compiles WebAssembly; without this the whole exercise sandbox
    # fails to boot under the policy.
    assert "'wasm-unsafe-eval'" in csp


def test_hsts_only_when_the_request_is_https(site):
    plain = client(site).get('/', headers={'X-Forwarded-Proto': 'http'})
    assert 'strict-transport-security' not in plain.headers

    secure = client(site).get('/', headers={'X-Forwarded-Proto': 'https'})
    assert secure.headers['strict-transport-security'] == 'max-age=15552000'
    assert 'upgrade-insecure-requests' in secure.headers['content-security-policy']


def test_slash_redirect_never_sends_an_absolute_http_location(site):
    response = client(site).get('/api/wishes/', follow_redirects=False)
    assert response.status_code == 307
    assert response.headers['location'] == '/api/wishes'


def test_page_404_is_the_site_page_not_fastapi_json(site):
    response = client(site).get('/no-such-page')
    assert response.status_code == 404
    assert response.headers['content-type'].startswith('text/html')
    assert '这一页不在书里' in response.text
    assert '{"detail"' not in response.text


def test_api_404_keeps_the_json_contract(site):
    response = client(site).get('/api/no-such-endpoint')
    assert response.status_code == 404
    assert response.headers['content-type'].startswith('application/json')
    assert response.json() == {'detail': 'Not Found'}


def test_favicon_ico_serves_the_real_icon(site):
    response = client(site).get('/favicon.ico')
    assert response.status_code == 200
    assert response.headers['content-type'].startswith('image/svg+xml')
    assert response.headers['cache-control'] == 'public, max-age=300, must-revalidate'


def test_robots_points_at_the_public_sitemap(site):
    response = client(site).get('/robots.txt')
    assert response.status_code == 200
    assert 'Sitemap: http://127.0.0.1:7860/sitemap.xml' in response.text
    assert 'Allow: /' in response.text


def test_sitemap_lists_the_single_crawlable_url(site):
    response = client(site).get('/sitemap.xml')
    assert response.status_code == 200
    assert response.headers['content-type'].startswith('application/xml')
    assert '<loc>http://127.0.0.1:7860/</loc>' in response.text
    assert '#chapter' not in response.text


def test_force_https_redirects_without_dropping_the_path(tmp_path, monkeypatch):
    app = make_app(tmp_path, monkeypatch, FORCE_HTTPS='1')
    response = client(app).get('/api/session', follow_redirects=False)
    assert response.status_code == 308
    assert response.headers['location'] == 'https://127.0.0.1:7860/api/session'
    assert response.headers['x-frame-options'] == 'SAMEORIGIN'


def test_pages_ship_no_inline_script_that_csp_would_block():
    # script-src is 'self' (plus wasm-unsafe-eval), so one inline <script>
    # would silently stop the login form from working in production.
    for name in ('index.html', 'login.html', 'assets/analytics.html', '404.html'):
        markup = (ROOT / name).read_text(encoding='utf-8')
        assert '<script>' not in markup, f'{name} carries an inline script'


def test_secure_cookie_follows_the_https_base_url(tmp_path, monkeypatch):
    base = 'https://learn.alphalio.cn'
    app = make_app(tmp_path, monkeypatch, base=base)
    response = client(app, base=base).get('/api/session')
    assert response.status_code == 200
    set_cookie = response.headers['set-cookie']
    lowered = set_cookie.lower()
    assert 'purplebook_session=' in set_cookie
    assert 'secure' in lowered
    assert 'httponly' in lowered
    assert 'samesite=lax' in lowered

def test_robots_never_advertises_a_loopback_sitemap_behind_a_proxy(site):
    # The live deployment left APP_BASE_URL at the loopback default, so
    # robots.txt pointed every crawler at 127.0.0.1. The forwarded host has to
    # win once the app is behind nginx.
    response = client(site).get('/robots.txt', headers={
        'x-forwarded-host': 'learn.example.org',
        'x-forwarded-proto': 'https',
    })
    assert 'Sitemap: https://learn.example.org/sitemap.xml' in response.text


def test_sitemap_uses_the_public_host_header_when_no_base_url_is_set(site):
    response = client(site).get('/sitemap.xml', headers={'host': '120.53.222.178:8899'})
    assert '<loc>http://120.53.222.178:8899/</loc>' in response.text
