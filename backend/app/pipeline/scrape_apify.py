from datetime import datetime
from typing import Any
from urllib.parse import urlparse, unquote

from apify_client import ApifyClient
from bs4 import BeautifulSoup

from app.core.config import Settings


def _title_from_url(url: str) -> str:
    if not url:
        return "Source"

    parsed = urlparse(url)
    host = parsed.netloc.replace("www.", "")
    segment = parsed.path.strip("/").split("/")[-1] if parsed.path else ""
    readable_segment = unquote(segment).replace("-", " ").replace("_", " ").strip()

    if readable_segment:
        return f"{host} - {readable_segment}"
    if host:
        return host
    return "Source"


def _extract_title(item: dict[str, Any], url: str) -> str:
    candidates = [
        item.get("title"),
        item.get("pageTitle"),
        item.get("ogTitle"),
    ]

    metadata = item.get("metadata")
    if isinstance(metadata, dict):
        candidates.extend([metadata.get("title"), metadata.get("og:title")])

    for candidate in candidates:
        text = str(candidate or "").strip()
        if text and text.lower() != "untitled":
            return text

    html = item.get("html")
    if html:
        soup = BeautifulSoup(str(html), "html.parser")
        if soup.title and soup.title.string:
            html_title = soup.title.string.strip()
            if html_title and html_title.lower() != "untitled":
                return html_title

    return _title_from_url(url)


def _extract_text(item: dict[str, Any]) -> str:
    if item.get("text"):
        return str(item["text"]).strip()

    if item.get("markdown"):
        return str(item["markdown"]).strip()

    if item.get("html"):
        soup = BeautifulSoup(str(item["html"]), "html.parser")
        for tag in soup(["script", "style", "noscript"]):
            tag.decompose()
        return " ".join(soup.get_text(separator=" ").split())

    return ""


def scrape_urls(settings: Settings, urls: list[str]) -> list[dict[str, str]]:
    if not settings.apify_api_token:
        raise ValueError("Missing APIFY_API_TOKEN")

    client = ApifyClient(settings.apify_api_token)

    run_input = {
        "startUrls": [{"url": url} for url in urls],
        "maxCrawlDepth": 0,
        "maxCrawlPages": len(urls),
    }

    run = client.actor(settings.apify_actor_id).call(run_input=run_input)
    dataset_id = run.get("defaultDatasetId")

    if not dataset_id:
        return []

    records: list[dict[str, str]] = []
    for item in client.dataset(dataset_id).iterate_items():
        text = _extract_text(item)
        if not text:
            continue

        url = str(item.get("url") or item.get("loadedUrl") or "")
        title = _extract_title(item, url)

        records.append(
            {
                "source_url": url,
                "title": title,
                "text": text,
                "scraped_at": datetime.utcnow().isoformat(),
            }
        )

    return records
