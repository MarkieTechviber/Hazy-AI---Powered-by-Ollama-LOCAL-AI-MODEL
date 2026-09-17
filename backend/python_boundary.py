"""Small ASGI boundary shared by optional local Python services."""
import json
import time


class LocalBoundary:
    def __init__(self, app, port=8080, max_bytes=5 * 1024 * 1024):
        self.app, self.port, self.max_bytes = app, port, max_bytes
        self.buckets = {}

    async def __call__(self, scope, receive, send):
        if scope['type'] != 'http':
            return await self.app(scope, receive, send)
        headers = dict(scope.get('headers', []))
        hosts = {f'localhost:{self.port}', f'127.0.0.1:{self.port}', f'[::1]:{self.port}'}
        # testserver is the in-process ASGI test client, never a network hostname.
        if scope.get('server', ('',))[0] == 'testserver':
            hosts.add('testserver')
        host = headers.get(b'host', b'').decode('latin1')
        origin = headers.get(b'origin', b'').decode('latin1')

        async def error(status, message):
            await send({'type': 'http.response.start', 'status': status, 'headers': [(b'content-type', b'application/json')]})
            await send({'type': 'http.response.body', 'body': json.dumps({'error': message}).encode()})

        if host not in hosts or (origin and origin not in {f'http://{h}' for h in hosts}):
            return await error(403, 'Host or Origin is not allowed.')
        if not origin and headers.get(b'sec-fetch-site') == b'cross-site':
            return await error(403, 'Cross-site request blocked.')
        now = time.monotonic()
        key = scope.get('client', ('local',))[0]
        count, deadline = self.buckets.get(key, (0, now + 60))
        if now >= deadline:
            count, deadline = 0, now + 60
        if count >= 120:
            return await error(429, 'Too many requests.')
        if len(self.buckets) >= 1000:
            self.buckets = {k: v for k, v in self.buckets.items() if v[1] > now}
            if len(self.buckets) >= 1000 and key not in self.buckets:
                return await error(429, 'Too many clients.')
        self.buckets[key] = count + 1, deadline
        chunks, total = [], 0
        while True:
            event = await receive()
            if event['type'] == 'http.disconnect':
                return
            data = event.get('body', b'')
            total += len(data)
            if total > self.max_bytes:
                return await error(413, 'Request body too large.')
            chunks.append(data)
            if not event.get('more_body', False):
                break
        payload = b''.join(chunks)
        if payload and scope['method'] in ('POST', 'PATCH', 'PUT'):
            try:
                if not isinstance(json.loads(payload), dict):
                    raise ValueError()
            except (ValueError, UnicodeError):
                return await error(400, 'Expected a JSON object.')
        delivered = False

        async def replay():
            nonlocal delivered
            if not delivered:
                delivered = True
                return {'type': 'http.request', 'body': payload, 'more_body': False}
            return await receive()

        await self.app(scope, replay, send)
