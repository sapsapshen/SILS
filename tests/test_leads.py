import pytest
from fastapi.testclient import TestClient

from app import create_app

BASE = 'http://127.0.0.1:7860'
ADMIN_EMAIL = 'admin@example.com'
ADMIN_PASSWORD = 'correct-horse-battery-staple'

VALID = {
    'name': '王老师',
    'email': 'Teacher@Example.com',
    'org': '示例中学',
    'size': '50-200',
    'interest': 'training',
    'note': '希望下学期给信息组做一次开源模型内训。',
}


@pytest.fixture
def site(tmp_path, monkeypatch):
    monkeypatch.setenv('APP_BASE_URL', BASE)
    monkeypatch.setenv('DATABASE_URL', 'sqlite:///' + (tmp_path / 'accounts.sqlite3').as_posix())
    monkeypatch.setenv('LOCAL_ADMIN_EMAIL', ADMIN_EMAIL)
    monkeypatch.setenv('LOCAL_ADMIN_PASSWORD', ADMIN_PASSWORD)
    monkeypatch.setenv('LOCAL_ADMIN_NAME', '管理员')
    monkeypatch.delenv('OAUTH_CLIENT_ID', raising=False)
    monkeypatch.delenv('OAUTH_CLIENT_SECRET', raising=False)
    return create_app(tmp_path), tmp_path


def login(client):
    return client.post('/api/auth/login', json={
        'email': ADMIN_EMAIL, 'password': ADMIN_PASSWORD, 'return_to': '#home',
    }, headers={'origin': BASE})


def test_public_form_accepts_a_valid_enquiry(site):
    client = TestClient(site[0], base_url=BASE)
    response = client.post('/api/leads', json=VALID, headers={'origin': BASE})
    assert response.status_code == 201
    assert response.json()['ok'] is True

    rows = site[0].state.db
    with rows() as conn:
        stored = conn.execute('SELECT * FROM leads').fetchone()
    assert stored['email'] == 'teacher@example.com'
    assert stored['org'] == '示例中学'
    assert stored['status'] == 'new'
    # The address itself is never stored, only its keyed digest.
    assert stored['visitor_hash'] and '127.0.0.1' not in stored['visitor_hash']


def test_form_rejects_bad_email_and_empty_name(site):
    client = TestClient(site[0], base_url=BASE)
    assert client.post('/api/leads', json={**VALID, 'email': 'nope'}).status_code == 422
    assert client.post('/api/leads', json={**VALID, 'name': '   '}).status_code == 422


def test_form_refuses_a_foreign_origin(site):
    client = TestClient(site[0], base_url=BASE)
    response = client.post('/api/leads', json=VALID, headers={'origin': 'https://evil.example'})
    assert response.status_code == 403


def test_form_is_rate_limited_per_address(site):
    client = TestClient(site[0], base_url=BASE)
    for _ in range(5):
        assert client.post('/api/leads', json=VALID, headers={'origin': BASE}).status_code == 201
    assert client.post('/api/leads', json=VALID, headers={'origin': BASE}).status_code == 429


def test_admin_can_read_and_update_leads(site):
    client = TestClient(site[0], base_url=BASE)
    assert client.get('/api/admin/leads').status_code == 401
    client.post('/api/leads', json=VALID, headers={'origin': BASE})
    assert login(client).status_code == 200

    listing = client.get('/api/admin/leads').json()
    assert listing['total'] == 1
    assert listing['counts'] == {'new': 1}
    lead = listing['items'][0]
    assert lead['name'] == '王老师'
    assert 'visitor_hash' not in lead

    updated = client.patch(f"/api/admin/leads/{lead['id']}", json={'status': 'contacted'})
    assert updated.status_code == 200
    assert client.get('/api/admin/leads?status=contacted').json()['total'] == 1
    assert client.patch(f"/api/admin/leads/{lead['id']}", json={'status': 'bogus'}).status_code == 422
