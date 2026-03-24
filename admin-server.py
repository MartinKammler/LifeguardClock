#!/usr/bin/env python3
"""
admin-server.py  –  Lokaler Webserver mit Nextcloud-Proxy fuer admin.html
LifeguardClock | Copyright (C) 2026 Martin Kammler | GPL v3

Startet einen HTTP-Server auf localhost:8080.
Lokale Dateien werden direkt ausgeliefert.
Alle /remote.php/* Anfragen werden transparent an Nextcloud weitergeleitet
– der Browser sieht nur localhost, kein CORS-Problem.

Starten:  python admin-server.py
Beenden:  Strg+C
"""

import http.server
import urllib.request
import urllib.error
import ssl
import re
import os
from http.server import ThreadingHTTPServer

PORT = 8080


def read_nextcloud_url():
    """Liest die Nextcloud-URL aus admin_config.js"""
    try:
        with open('admin_config.js', encoding='utf-8') as f:
            content = f.read()
        m = re.search(r"""url\s*:\s*['"]([^'"]+)['"]""", content)
        if m:
            return m.group(1).rstrip('/')
    except FileNotFoundError:
        pass
    except Exception as e:
        print(f'  Fehler beim Lesen von admin_config.js: {e}')
    return None


NC_URL = read_nextcloud_url()


class ProxyHandler(http.server.SimpleHTTPRequestHandler):

    def _cors_headers(self):
        self.send_header('Access-Control-Allow-Origin', f'http://localhost:{PORT}')
        self.send_header('Access-Control-Allow-Methods',
                         'GET, PUT, DELETE, PROPFIND, MKCOL, OPTIONS')
        self.send_header('Access-Control-Allow-Headers',
                         'Authorization, Content-Type, Depth, X-Requested-With')

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors_headers()
        self.end_headers()

    def _is_local(self):
        if self.path.startswith('/remote.php/'):
            return False
        local = self.translate_path(self.path.split('?')[0])
        return os.path.isfile(local)

    def _proxy(self, method):
        if not NC_URL:
            self.send_error(503,
                'admin_config.js: Nextcloud-URL nicht gefunden. '
                'Bitte admin_config.example.js als admin_config.js kopieren.')
            return

        target = NC_URL + self.path
        length = int(self.headers.get('Content-Length') or 0)
        body = self.rfile.read(length) if length > 0 else None

        # Nur sichere Header weitergeben
        fwd = {}
        for k, v in self.headers.items():
            if k.lower() not in ('host', 'origin', 'referer', 'connection',
                                  'te', 'trailer', 'upgrade'):
                fwd[k] = v

        ctx = ssl.create_default_context()

        try:
            req = urllib.request.Request(target, data=body,
                                         headers=fwd, method=method)
            with urllib.request.urlopen(req, context=ctx) as resp:
                data = resp.read()
                self.send_response(resp.status)
                for k, v in resp.headers.items():
                    if k.lower() not in ('transfer-encoding', 'connection',
                                         'content-length'):
                        self.send_header(k, v)
                self._cors_headers()
                self.send_header('Content-Length', str(len(data)))
                self.end_headers()
                self.wfile.write(data)

        except urllib.error.HTTPError as e:
            body_err = e.read() or b''
            self.send_response(e.code)
            # Wichtige Antwort-Header weiterleiten (z. B. WWW-Authenticate bei 401)
            for k, v in e.headers.items():
                if k.lower() not in ('transfer-encoding', 'connection'):
                    self.send_header(k, v)
            self._cors_headers()
            self.send_header('Content-Length', str(len(body_err)))
            self.end_headers()
            self.wfile.write(body_err)

        except Exception as e:
            print(f'  Proxy-Fehler [{method} {self.path}]: {e}')
            self.send_error(502, f'Proxy-Fehler: {e}')

    def do_GET(self):
        if self.path in ('/', ''):
            self.send_response(302)
            self.send_header('Location', '/admin.html')
            self.end_headers()
            return
        if self._is_local():
            super().do_GET()
        else:
            self._proxy('GET')

    def do_HEAD(self):
        if self._is_local():
            super().do_HEAD()
        else:
            self._proxy('HEAD')

    def do_PUT(self):
        self._proxy('PUT')

    def do_DELETE(self):
        self._proxy('DELETE')

    def do_PROPFIND(self):
        self._proxy('PROPFIND')

    def do_MKCOL(self):
        self._proxy('MKCOL')

    def log_message(self, fmt, *args):
        try:
            parts = args[0].split()
            method = parts[0] if parts else '?'
            path   = parts[1] if len(parts) > 1 else self.path
            note = '' if self._is_local() else '  → Nextcloud'
            print(f'  {method:<9} {path}{note}', flush=True)
        except Exception:
            pass


if __name__ == '__main__':
    print()
    if not NC_URL:
        print('  ⚠  admin_config.js nicht gefunden.')
        print('     Bitte admin_config.example.js als admin_config.js kopieren und anpassen.')
        print()
    else:
        print(f'  Nextcloud : {NC_URL}')

    print(f'  Admin         : http://localhost:{PORT}/admin.html')
    print(f'  LifeguardClock: http://localhost:{PORT}/LifeguardClock.html')
    print(f'  Editor        : http://localhost:{PORT}/editor.html')
    print(f'  Dashboard     : http://localhost:{PORT}/dashboard.html')
    print('  Beenden       : Strg+C')
    print()

    server = ThreadingHTTPServer(('127.0.0.1', PORT), ProxyHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\n  Server gestoppt.')
