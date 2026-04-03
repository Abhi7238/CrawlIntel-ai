from datetime import datetime
from typing import Any

from apify_client import ApifyClient
from bs4 import BeautifulSoup

from app.core.config import Settings


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
        title = str(item.get("title") or "Untitled")

        records.append(
            {
                "source_url": url,
                "title": title,
                "text": text,
                "scraped_at": datetime.utcnow().isoformat(),
            }
        )

    return records
