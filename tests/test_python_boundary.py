import unittest

from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.python_boundary import LocalBoundary


def make_client(max_bytes=1024):
    app = FastAPI()
    app.add_middleware(LocalBoundary, port=8080, max_bytes=max_bytes)

    @app.post('/echo')
    async def echo():
        return {'ok': True}

    return TestClient(app)


class LocalBoundaryTests(unittest.TestCase):
    def test_accepts_loopback_test_client_and_json_object(self):
        response = make_client().post('/echo', json={'value': 1})
        self.assertEqual(response.status_code, 200)

    def test_rejects_cross_site_origin(self):
        response = make_client().post(
            '/echo', json={'value': 1},
            headers={'origin': 'https://attacker.example', 'sec-fetch-site': 'cross-site'},
        )
        self.assertEqual(response.status_code, 403)

    def test_rejects_non_object_and_malformed_json(self):
        client = make_client()
        self.assertEqual(client.post('/echo', content='[]', headers={'content-type': 'application/json'}).status_code, 400)
        self.assertEqual(client.post('/echo', content='{', headers={'content-type': 'application/json'}).status_code, 400)

    def test_rejects_oversized_body(self):
        response = make_client(max_bytes=32).post('/echo', json={'value': 'x' * 100})
        self.assertEqual(response.status_code, 413)


if __name__ == '__main__':
    unittest.main()
