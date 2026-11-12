#!/usr/bin/env python3
"""Atualiza seis manchetes oficiais via RSS da Agência Câmara (sem scraping)."""
import json
import os
import sys
import tempfile
import re
from email.utils import parsedate_to_datetime
from datetime import timedelta
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

FEED = "https://www.camara.leg.br/noticias/rss/ultimas-noticias"
OUTPUT = Path(__file__).resolve().parents[1] / "dados" / "noticias-camara.json"


def extract(xml_bytes):
    root = ET.fromstring(xml_bytes)
    items = []
    seen = set()
    for item in root.findall(".//channel/item"):
        title = (item.findtext("title") or "").strip()
        url = (item.findtext("link") or "").strip()
        parsed = urlparse(url)
        if not title or parsed.scheme != "https" or parsed.hostname not in {"www.camara.leg.br", "camara.leg.br"}:
            continue
        if not re.match(r"^/noticias/\d+(?:-|/|$)", parsed.path):
            continue
        if parsed.path in seen:
            continue
        seen.add(parsed.path)
        raw_date = item.findtext("pubDate")
        try:
            published = parsedate_to_datetime(raw_date).astimezone(timezone.utc)
        except (TypeError, ValueError, IndexError):
            continue
        items.append({"title": title, "url": url, "published_at": published.isoformat(timespec="seconds")})
        if len(items) == 6:
            break
    if len(items) != 6:
        raise ValueError("RSS retornou menos de seis notícias válidas; preservando arquivo anterior")
    latest = max(datetime.fromisoformat(item["published_at"]) for item in items)
    if datetime.now(timezone.utc) - latest > timedelta(days=7):
        raise ValueError("Fonte sem notícias recentes há mais de sete dias")
    return items


def update():
    req = urllib.request.Request(FEED, headers={"User-Agent": "OQueMuda-noticias/1.0 (+https://github.com/igortarcizio/oquemuda)", "Accept": "application/rss+xml, application/xml, text/xml"})
    with urllib.request.urlopen(req, timeout=25) as response:
        items = extract(response.read(2_000_000))
    payload = {"source": FEED, "updated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"), "items": items}
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=OUTPUT.parent, delete=False) as tmp:
        json.dump(payload, tmp, ensure_ascii=False, indent=2)
        tmp.write("\n")
        temporary = tmp.name
    os.replace(temporary, OUTPUT)
    print("Atualizadas seis notícias oficiais:", payload["updated_at"])


if __name__ == "__main__":
    try:
        update()
    except Exception as exc:
        print(f"Falha na atualização: {exc}", file=sys.stderr)
        sys.exit(1)
