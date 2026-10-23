from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from configure import ROOT, write_config


class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("X-Content-Type-Options", "nosniff")
        super().end_headers()


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Serveur local de Toolbox Share")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()
    write_config()
    server = ThreadingHTTPServer(("127.0.0.1", args.port), partial(Handler, directory=str(ROOT / "public")))
    print(f"Toolbox Share : http://localhost:{args.port}/", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.server_close()