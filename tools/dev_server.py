import argparse
import http.server
import os
import posixpath
import socketserver
import sys
from pathlib import Path
from typing import Optional, List


def _safe_join(root: Path, rel: str) -> Optional[Path]:
  rel = rel.lstrip("/")
  candidate = (root / rel).resolve()
  try:
    candidate.relative_to(root.resolve())
  except ValueError:
    return None
  return candidate


class MultiRootHandler(http.server.SimpleHTTPRequestHandler):
  def __init__(self, *args, public_dir: Path, data_dir: Path, **kwargs):
    self.public_dir = public_dir
    self.data_dir = data_dir
    super().__init__(*args, directory=str(public_dir), **kwargs)

  def translate_path(self, path: str) -> str:
    parsed = path.split("?", 1)[0].split("#", 1)[0]
    parsed = posixpath.normpath(parsed)

    # Mount /data/* to the repo data directory.
    if parsed == "/data" or parsed.startswith("/data/"):
      rel = parsed[len("/data") :]
      target = _safe_join(self.data_dir, rel)
      return str(target) if target else str(self.data_dir)

    # Everything else is served from public/.
    rel = parsed
    if rel == "/":
      rel = "/index.html"
    target = _safe_join(self.public_dir, rel)
    return str(target) if target else str(self.public_dir / "index.html")

  # Enable Range requests for PMTiles/Parquet dev usage.
  def send_head(self):
    path = Path(self.translate_path(self.path))
    if path.is_dir():
      return super().send_head()
    if not path.exists():
      self.send_error(404, "File not found")
      return None

    ctype = self.guess_type(str(path))
    try:
      f = open(path, "rb")
    except OSError:
      self.send_error(404, "File not found")
      return None

    fs = os.fstat(f.fileno())
    size = fs.st_size
    start = 0
    end = size - 1
    status = 200

    range_header = self.headers.get("Range")
    if range_header:
      try:
        unit, rng = range_header.split("=", 1)
        if unit.strip() == "bytes":
          start_s, end_s = (rng.split("-", 1) + [""])[:2]
          if start_s.strip():
            start = int(start_s)
          if end_s.strip():
            end = int(end_s)
          else:
            end = size - 1
          if start < 0 or end >= size or start > end:
            raise ValueError("Invalid range")
          status = 206
      except Exception:
        f.close()
        self.send_error(416, "Requested Range Not Satisfiable")
        return None

    self.send_response(status)
    self.send_header("Content-type", ctype)
    self.send_header("Accept-Ranges", "bytes")
    if status == 206:
      self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
      self.send_header("Content-Length", str(end - start + 1))
    else:
      self.send_header("Content-Length", str(size))
    self.send_header("Last-Modified", self.date_time_string(fs.st_mtime))
    self.end_headers()
    f.seek(start)
    self.range = (start, end)
    return f

  def copyfile(self, source, outputfile):
    if getattr(self, "range", None):
      start, end = self.range
      remaining = end - start + 1
      bufsize = 1024 * 64
      while remaining > 0:
        chunk = source.read(min(bufsize, remaining))
        if not chunk:
          break
        outputfile.write(chunk)
        remaining -= len(chunk)
      return
    return super().copyfile(source, outputfile)


def main(argv: List[str]) -> int:
  parser = argparse.ArgumentParser(description="Dev server for NetworkView public/ + data/ (Range-enabled).")
  parser.add_argument("--public-dir", default="public", help="Directory to serve as the site root.")
  parser.add_argument("--data-dir", default="data", help="Directory to mount at /data/ .")
  parser.add_argument("--port", type=int, default=5137)
  parser.add_argument("--host", default="127.0.0.1")
  args = parser.parse_args(argv)

  public_dir = Path(args.public_dir).resolve()
  data_dir = Path(args.data_dir).resolve()
  if not public_dir.exists():
    raise SystemExit(f"public dir not found: {public_dir}")
  if not data_dir.exists():
    print(f"warning: data dir not found: {data_dir}", file=sys.stderr)

  handler = lambda *h_args, **h_kwargs: MultiRootHandler(
    *h_args, public_dir=public_dir, data_dir=data_dir, **h_kwargs
  )

  with socketserver.TCPServer((args.host, args.port), handler) as httpd:
    print(f"Serving {public_dir} at http://{args.host}:{args.port}")
    print(f"Mounting {data_dir} at http://{args.host}:{args.port}/data/")
    httpd.serve_forever()

  return 0


if __name__ == "__main__":
  raise SystemExit(main(sys.argv[1:]))
