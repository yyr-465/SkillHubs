import http.server
import os
import socketserver

# Static server for the Web build with correct MIME types.
# Plain `python -m http.server` on this machine serves .js as text/plain,
# which the browser rejects for <script type="module"> (blank page).

PORT = int(os.environ.get("PORT", "8080"))
DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "dist")

class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".mjs": "text/javascript",
        ".json": "application/json",
        ".svg": "image/svg+xml",
        ".css": "text/css",
    }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIR, **kwargs)

    def log_message(self, *args):
        pass

with socketserver.TCPServer(("127.0.0.1", PORT), Handler) as httpd:
    print("SkillHub Web: http://localhost:%d/" % PORT)
    httpd.serve_forever()
