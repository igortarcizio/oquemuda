"""Testes do extrator de notícias da Agência Câmara."""
import importlib.util
import unittest
from datetime import datetime, timezone, timedelta
from email.utils import format_datetime
from pathlib import Path
from xml.sax.saxutils import escape

spec = importlib.util.spec_from_file_location("noticias", Path(__file__).parents[1] / "scripts" / "atualizar_noticias.py")
noticias = importlib.util.module_from_spec(spec)
spec.loader.exec_module(noticias)


def feed(count=6, days_ago=0, duplicate=False):
    published = format_datetime(datetime.now(timezone.utc) - timedelta(days=days_ago))
    rows = []
    for i in range(count):
        number = 1000 if duplicate else 1000 + i
        rows.append(f"<item><title>{escape('Manchete ' + str(i))}</title>"
                    f"<link>https://www.camara.leg.br/noticias/{number}-exemplo/</link>"
                    f"<pubDate>{published}</pubDate></item>")
    return ("<rss version='2.0'><channel>" + "".join(rows) + "</channel></rss>").encode()


class NewsTest(unittest.TestCase):
    def test_six_official_and_original_titles(self):
        items = noticias.extract(feed())
        self.assertEqual(6, len(items))
        self.assertEqual("Manchete 0", items[0]["title"])
        self.assertEqual("https://www.camara.leg.br/noticias/1000-exemplo/", items[0]["url"])

    def test_fewer_than_six_is_rejected(self):
        with self.assertRaises(ValueError):
            noticias.extract(feed(count=5))

    def test_duplicate_links_are_rejected(self):
        with self.assertRaises(ValueError):
            noticias.extract(feed(duplicate=True))

    def test_stale_feed_is_rejected(self):
        with self.assertRaises(ValueError):
            noticias.extract(feed(days_ago=9))

    def test_non_official_link_is_rejected(self):
        data = feed().replace(b"www.camara.leg.br", b"example.org")
        with self.assertRaises(ValueError):
            noticias.extract(data)


if __name__ == "__main__":
    unittest.main()
