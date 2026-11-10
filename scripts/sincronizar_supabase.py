#!/usr/bin/env python3
"""Sincroniza a cópia oficial parcial com o PostgreSQL via PostgREST.
Requer SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY apenas no ambiente de CI.
Nunca incluir a chave de serviço no frontend ou no repositório.
"""
import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "dados" / "catalogo.js"
URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
BATCH = 100


def load_catalog():
    raw = CATALOG.read_text(encoding="utf-8")
    start = raw.index("=") + 1
    end = raw.rfind("};")
    if end < 0:
        raise ValueError("Catálogo incompleto")
    data = json.loads(raw[start:end + 1])
    if not isinstance(data.get("items"), list):
        raise ValueError("Catálogo sem lista de propostas")
    return data


def rows_for(items):
    for p in items:
        try:
            pid = int(p["id"])
            year = int(p["ano"])
            number = int(p["numero"])
            if pid <= 0 or not 1800 <= year <= 2100 or number <= 0:
                continue
            typ = str(p["siglaTipo"]).upper()
            if typ not in {"PL", "PLP", "PEC", "MPV", "PDL", "PRC"}:
                continue
            date = str(p.get("dataApresentacao") or "")[:10] or None
            yield {
                "id": pid, "sigla_tipo": typ, "numero": number, "ano": year,
                "ementa": str(p.get("ementa") or ""),
                "data_apresentacao": date,
                "uri_oficial": "https://www.camara.leg.br/proposicoesWeb/fichadetramitacao?idProposicao=" + str(pid)
            }
        except (KeyError, TypeError, ValueError):
            continue


def upsert(rows):
    body = json.dumps(rows, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        URL + "/rest/v1/proposicoes?on_conflict=id",
        data=body, method="POST",
        headers={
            "apikey": KEY,
            "Authorization": "Bearer " + KEY,
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates,return=minimal",
            "User-Agent": "OQueMuda-Sync/1.0"
        }
    )
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=35) as response:
                if response.status not in (200, 201, 204):
                    raise RuntimeError("Erro HTTP " + str(response.status))
            return
        except urllib.error.HTTPError as exc:
            # Erros de configuração ou permissão exigem correção, não retries.
            if exc.code not in (429, 500, 502, 503, 504) or attempt == 2:
                raise RuntimeError("Falha no envio: HTTP " + str(exc.code)) from exc
        except (TimeoutError, urllib.error.URLError):
            if attempt == 2:
                raise
        time.sleep(2 * (attempt + 1))


def main():
    if not URL.startswith("https://") or not KEY:
        raise SystemExit("Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY como secrets do GitHub Actions")
    data = load_catalog()
    rows = list({r["id"]: r for r in rows_for(data["items"])}.values())
    if not rows:
        raise SystemExit("Nenhum registro válido; sincronização cancelada")
    for i in range(0, len(rows), BATCH):
        upsert(rows[i:i + BATCH])
        print(f"Enviados {min(i + BATCH, len(rows))}/{len(rows)}", flush=True)
    print(f"Sincronização concluída: {len(rows)} propostas da reserva parcial. Não é cobertura integral.", flush=True)


if __name__ == "__main__":
    main()
