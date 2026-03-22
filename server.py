#!/usr/bin/env python3
from http.server import HTTPServer, SimpleHTTPRequestHandler

ALLOWED_ORIGIN = "http://127.0.0.1:6221"

class CORSRequestHandler(SimpleHTTPRequestHandler):

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", ALLOWED_ORIGIN)
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

def run_server(host="127.0.0.1", port=8000):
    server = HTTPServer((host, port), CORSRequestHandler)
    print(f"Serving on http://{host}:{port}")
    server.serve_forever()

if __name__ == "__main__":
    run_server()
