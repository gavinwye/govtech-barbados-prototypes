#!/usr/bin/env python3
"""Discover likely fillable government forms from Barbados domains.

The crawler prefers sitemap discovery, falls back to bounded HTML crawling,
and emits a CSV manifest containing only likely form candidates.
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import re
import sys
import time
from collections import deque
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from typing import Iterable
from urllib.parse import urljoin, urlparse, urlunparse
from xml.etree import ElementTree

import requests


TARGET_EXTENSIONS = {".pdf", ".doc", ".docx", ".xls", ".xlsx", ".odt", ".rtf"}
MANIFEST_COLUMNS = [
    "form_url",
    "form_domain",
    "source_page_url",
    "source_page_title",
    "link_text",
    "file_extension",
    "content_type",
    "status_code",
    "content_length",
    "pdf_page_count",
    "discovered_via",
    "candidate_type",
    "form_confidence",
    "classification_reason",
    "agency_guess",
    "last_checked_at",
]
POSITIVE_KEYWORDS = {
    "application",
    "apply",
    "declaration",
    "download form",
    "fill",
    "fillable",
    "form",
    "licence",
    "license",
    "permit",
    "questionnaire",
    "registration",
    "renewal",
    "request",
}
NEGATIVE_KEYWORDS = {
    "brochure",
    "bulletin",
    "guide",
    "guidance",
    "manual",
    "minutes",
    "notice",
    "policy",
    "procedure",
    "publication",
    "report",
    "speech",
}
LANDING_PAGE_HINTS = {
    "application",
    "apply",
    "download",
    "form",
    "permit",
    "registration",
    "request",
}
AGENCY_MAP = {
    "agriculture.gov.bb": "Agriculture",
    "barbadospolice.gov.bb": "Police",
    "caipo.gov.bb": "CAIPO",
    "health.gov.bb": "Health",
    "immigration.gov.bb": "IMMD",
    "landregistry.gov.bb": "Land Registry",
    "planning.gov.bb": "Town Planning",
    "police.gov.bb": "Police",
    "ssa.gov.bb": "NIS",
    "townplanning.gov.bb": "Town Planning",
}
DEFAULT_HEADERS = {
    "User-Agent": "GovTechBarbadosFormCrawler/1.0 (+https://github.com/govtech-bb)",
    "Accept": "*/*",
}
MAX_PDF_DOWNLOAD_BYTES = 8 * 1024 * 1024


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def normalize_domain(domain: str) -> str:
    text = domain.strip().lower()
    if "://" in text:
        parsed = urlparse(text)
        text = parsed.netloc or parsed.path
    return text.strip("/")


def normalize_url(url: str) -> str:
    parsed = urlparse(url.strip())
    scheme = parsed.scheme.lower() or "https"
    netloc = parsed.netloc.lower()
    if netloc.endswith(":80") and scheme == "http":
        netloc = netloc[:-3]
    if netloc.endswith(":443") and scheme == "https":
        netloc = netloc[:-4]
    path = parsed.path or "/"
    if path != "/":
        path = re.sub(r"/{2,}", "/", path.rstrip("/"))
    query = "&".join(
        sorted(part for part in parsed.query.split("&") if part)
    )
    return urlunparse((scheme, netloc, path, "", query, ""))


def canonical_host(hostname: str) -> str:
    host = (hostname or "").lower()
    return host[4:] if host.startswith("www.") else host


def same_domain(url: str, domain: str) -> bool:
    host = canonical_host(urlparse(url).hostname or "")
    target = canonical_host(domain)
    return host == target


def extension_for_url(url: str) -> str:
    path = urlparse(url).path.lower()
    for ext in TARGET_EXTENSIONS:
        if path.endswith(ext):
            return ext
    return ""


def is_probable_html(content_type: str, url: str) -> bool:
    if "html" in (content_type or "").lower():
        return True
    path = urlparse(url).path.lower()
    if extension_for_url(url):
        return False
    return path == "" or path.endswith("/") or path.endswith(".html") or path.endswith(".htm")


def extract_keywords(text: str) -> tuple[list[str], list[str]]:
    lowered = text.lower()
    positives = sorted(keyword for keyword in POSITIVE_KEYWORDS if keyword in lowered)
    negatives = sorted(keyword for keyword in NEGATIVE_KEYWORDS if keyword in lowered)
    return positives, negatives


def infer_agency(domain: str) -> str:
    host = canonical_host(domain)
    if host in AGENCY_MAP:
        return AGENCY_MAP[host]
    first = host.split(".", 1)[0]
    title = first.replace("-", " ").replace("_", " ").strip()
    return title.title() if title else "Unknown"


def parse_content_length(value: str | None) -> int | None:
    if not value:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def extract_sitemaps_from_robots(content: str) -> list[str]:
    sitemaps: list[str] = []
    for line in content.splitlines():
        stripped = line.strip()
        if stripped.lower().startswith("sitemap:"):
            sitemap = stripped.split(":", 1)[1].strip()
            if sitemap:
                sitemaps.append(normalize_url(sitemap))
    return list(dict.fromkeys(sitemaps))


def parse_sitemap_xml(content: bytes) -> tuple[list[str], list[str]]:
    docs: list[str] = []
    pages: list[str] = []
    try:
        root = ElementTree.fromstring(content)
    except ElementTree.ParseError:
        return docs, pages

    namespace_match = re.match(r"\{(.*)\}", root.tag)
    ns = {"sm": namespace_match.group(1)} if namespace_match else {}
    loc_query = ".//sm:loc" if ns else ".//loc"
    for node in root.findall(loc_query, ns):
        if not node.text:
            continue
        loc = normalize_url(node.text)
        if extension_for_url(loc):
            docs.append(loc)
        else:
            pages.append(loc)
    return list(dict.fromkeys(docs)), list(dict.fromkeys(pages))


def estimate_pdf_page_count(content: bytes) -> int | None:
    matches = re.findall(rb"/Type\s*/Page\b", content)
    if not matches:
        return None
    count = len(matches)
    return count or None


class LinkHTMLParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.links: list[tuple[str, str]] = []
        self.title_parts: list[str] = []
        self.text_parts: list[str] = []
        self._in_title = False
        self._current_href: str | None = None
        self._current_text: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attr_map = dict(attrs)
        if tag == "title":
            self._in_title = True
        elif tag == "a":
            self._current_href = attr_map.get("href")
            self._current_text = []

    def handle_endtag(self, tag: str) -> None:
        if tag == "title":
            self._in_title = False
        elif tag == "a":
            if self._current_href:
                text = " ".join("".join(self._current_text).split())
                self.links.append((self._current_href, text))
            self._current_href = None
            self._current_text = []

    def handle_data(self, data: str) -> None:
        cleaned = " ".join(data.split())
        if not cleaned:
            return
        self.text_parts.append(cleaned)
        if self._in_title:
            self.title_parts.append(cleaned)
        if self._current_href is not None:
            self._current_text.append(cleaned)

    @property
    def title(self) -> str:
        return " ".join(self.title_parts).strip()

    @property
    def text(self) -> str:
        return " ".join(self.text_parts).strip()


@dataclass
class Candidate:
    form_url: str
    form_domain: str
    source_page_url: str
    source_page_title: str
    link_text: str
    file_extension: str
    content_type: str
    status_code: int | None
    content_length: int | None
    pdf_page_count: int | None
    discovered_via: str
    candidate_type: str
    form_confidence: str
    classification_reason: str
    agency_guess: str
    last_checked_at: str
    score: int = field(repr=False, default=0)
    classification: str = field(repr=False, default="unknown")

    def to_manifest_row(self) -> dict[str, str | int | None]:
        data = asdict(self)
        data.pop("score", None)
        data.pop("classification", None)
        return data


@dataclass
class DiscoveryConfig:
    max_depth: int = 2
    max_pages_per_domain: int = 100
    delay_seconds: float = 0.5
    request_timeout: float = 15.0
    use_playwright_fallback: bool = False


class Discoverer:
    def __init__(self, session: requests.Session | None = None, config: DiscoveryConfig | None = None) -> None:
        self.session = session or requests.Session()
        self.session.headers.update(DEFAULT_HEADERS)
        self.config = config or DiscoveryConfig()

    def request(
        self,
        method: str,
        url: str,
        *,
        stream: bool = False,
        allow_redirects: bool = True,
    ) -> requests.Response | None:
        try:
            response = self.session.request(
                method,
                url,
                timeout=self.config.request_timeout,
                allow_redirects=allow_redirects,
                stream=stream,
            )
            time.sleep(self.config.delay_seconds)
            return response
        except requests.RequestException:
            return None

    def resolve_base_url(self, domain: str) -> str | None:
        for scheme in ("https", "http"):
            url = f"{scheme}://{domain}/"
            response = self.request("GET", url)
            if response and response.status_code < 500:
                return normalize_url(response.url)
        return None

    def fetch_robots_sitemaps(self, base_url: str) -> list[str]:
        robots_url = urljoin(base_url, "/robots.txt")
        response = self.request("GET", robots_url)
        sitemaps: list[str] = []
        if response and response.ok and response.text:
            sitemaps.extend(extract_sitemaps_from_robots(response.text))
        if not sitemaps:
            sitemaps.extend(
                normalize_url(urljoin(base_url, candidate))
                for candidate in ("/sitemap.xml", "/sitemap_index.xml")
            )
        return list(dict.fromkeys(sitemaps))

    def fetch_sitemap_candidates(self, sitemap_urls: Iterable[str]) -> tuple[list[str], list[str]]:
        documents: list[str] = []
        pages: list[str] = []
        seen_sitemaps: set[str] = set()
        queue = deque(normalize_url(url) for url in sitemap_urls)

        while queue:
            sitemap_url = queue.popleft()
            if sitemap_url in seen_sitemaps:
                continue
            seen_sitemaps.add(sitemap_url)
            response = self.request("GET", sitemap_url)
            if not response or not response.ok or not response.content:
                continue
            docs, locs = parse_sitemap_xml(response.content)
            nested = [loc for loc in locs if loc.endswith(".xml")]
            pages.extend(loc for loc in locs if not loc.endswith(".xml"))
            documents.extend(docs)
            queue.extend(nested)

        return list(dict.fromkeys(documents)), list(dict.fromkeys(pages))

    def crawl_html(self, base_url: str, domain: str, seed_pages: Iterable[str]) -> tuple[list[Candidate], bool]:
        visited: set[str] = set()
        queue: deque[tuple[str, int, str]] = deque()
        queue.append((normalize_url(base_url), 0, "seed"))
        for seed in seed_pages:
            if same_domain(seed, domain):
                queue.append((normalize_url(seed), 0, "sitemap"))

        results: list[Candidate] = []
        produced_candidates = False

        while queue and len(visited) < self.config.max_pages_per_domain:
            page_url, depth, discovered_via = queue.popleft()
            if page_url in visited or depth > self.config.max_depth:
                continue
            visited.add(page_url)

            response = self.request("GET", page_url)
            if not response or not response.ok:
                continue
            content_type = response.headers.get("Content-Type", "")
            if not is_probable_html(content_type, response.url):
                continue

            parser = LinkHTMLParser()
            parser.feed(response.text)
            page_title = parser.title
            page_text = parser.text[:5000]

            linked_files = 0
            for href, link_text in parser.links:
                absolute = normalize_url(urljoin(response.url, href))
                if not absolute.startswith(("http://", "https://")):
                    continue
                if extension_for_url(absolute):
                    candidate = self.build_candidate(
                        absolute,
                        domain,
                        source_page_url=normalize_url(response.url),
                        source_page_title=page_title,
                        link_text=link_text,
                        discovered_via=discovered_via if discovered_via != "seed" else "crawl",
                        candidate_type="downloadable_file",
                    )
                    if candidate:
                        results.append(candidate)
                        produced_candidates = True
                    linked_files += 1
                    continue
                if same_domain(absolute, domain):
                    if depth + 1 <= self.config.max_depth:
                        queue.append((absolute, depth + 1, "crawl"))

            landing_candidate = self.build_candidate(
                normalize_url(response.url),
                domain,
                source_page_url=normalize_url(response.url),
                source_page_title=page_title,
                link_text=page_title,
                discovered_via=discovered_via if discovered_via != "seed" else "crawl",
                candidate_type="form_landing_page",
                page_text=page_text,
                linked_files=linked_files,
            )
            if landing_candidate:
                results.append(landing_candidate)
                produced_candidates = True

        return results, produced_candidates

    def maybe_run_playwright(self, base_url: str, domain: str) -> list[Candidate]:
        if not self.config.use_playwright_fallback:
            return []
        try:
            from playwright.sync_api import sync_playwright
        except ImportError as exc:
            raise RuntimeError(
                "Playwright fallback requested but playwright is not installed. "
                "Install it first or omit --use-playwright-fallback."
            ) from exc

        candidates: list[Candidate] = []
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True)
            page = browser.new_page()
            page.goto(base_url, wait_until="networkidle", timeout=int(self.config.request_timeout * 1000))
            anchors = page.locator("a").evaluate_all(
                """elements => elements.map(element => ({
                    href: element.href,
                    text: (element.textContent || '').trim()
                }))"""
            )
            title = page.title()
            browser.close()

        for anchor in anchors:
            href = anchor.get("href") or ""
            text = anchor.get("text") or ""
            absolute = normalize_url(href)
            if not same_domain(absolute, domain):
                continue
            if extension_for_url(absolute):
                candidate = self.build_candidate(
                    absolute,
                    domain,
                    source_page_url=normalize_url(base_url),
                    source_page_title=title,
                    link_text=text,
                    discovered_via="crawl",
                    candidate_type="downloadable_file",
                )
                if candidate:
                    candidates.append(candidate)
        return candidates

    def fetch_document_metadata(self, url: str) -> tuple[int | None, str, int | None, int | None]:
        status_code: int | None = None
        content_type = ""
        content_length: int | None = None
        pdf_page_count: int | None = None

        head = self.request("HEAD", url, allow_redirects=True)
        if head is not None:
            status_code = head.status_code
            content_type = head.headers.get("Content-Type", "")
            content_length = parse_content_length(head.headers.get("Content-Length"))

        should_get = (
            head is None
            or status_code in (405, 403)
            or extension_for_url(url) == ".pdf"
            or not content_type
        )
        if should_get:
            response = self.request("GET", url, stream=True, allow_redirects=True)
            if response is not None:
                status_code = response.status_code
                content_type = response.headers.get("Content-Type", content_type)
                content_length = parse_content_length(response.headers.get("Content-Length")) or content_length
                if extension_for_url(url) == ".pdf" and response.ok:
                    buffer = io.BytesIO()
                    for chunk in response.iter_content(chunk_size=8192):
                        if not chunk:
                            continue
                        buffer.write(chunk)
                        if buffer.tell() >= MAX_PDF_DOWNLOAD_BYTES:
                            break
                    pdf_page_count = estimate_pdf_page_count(buffer.getvalue())
        return status_code, content_type, content_length, pdf_page_count

    def build_candidate(
        self,
        url: str,
        domain: str,
        *,
        source_page_url: str,
        source_page_title: str,
        link_text: str,
        discovered_via: str,
        candidate_type: str,
        page_text: str = "",
        linked_files: int = 0,
    ) -> Candidate | None:
        form_url = normalize_url(url)
        extension = extension_for_url(form_url)
        if candidate_type == "downloadable_file" and not extension:
            return None
        if candidate_type == "form_landing_page" and extension:
            return None

        status_code: int | None = None
        content_type = ""
        content_length: int | None = None
        pdf_page_count: int | None = None
        if candidate_type == "downloadable_file":
            status_code, content_type, content_length, pdf_page_count = self.fetch_document_metadata(form_url)

        classification, confidence, score, reason = classify_candidate(
            url=form_url,
            source_page_title=source_page_title,
            link_text=link_text,
            candidate_type=candidate_type,
            file_extension=extension,
            pdf_page_count=pdf_page_count,
            page_text=page_text,
            linked_files=linked_files,
        )
        if classification not in {"form", "possible_form"}:
            return None

        return Candidate(
            form_url=form_url,
            form_domain=canonical_host(domain),
            source_page_url=source_page_url,
            source_page_title=source_page_title,
            link_text=link_text,
            file_extension=extension,
            content_type=content_type,
            status_code=status_code,
            content_length=content_length,
            pdf_page_count=pdf_page_count,
            discovered_via=discovered_via,
            candidate_type=candidate_type,
            form_confidence=confidence,
            classification_reason=reason,
            agency_guess=infer_agency(domain),
            last_checked_at=now_iso(),
            score=score,
            classification=classification,
        )

    def discover_domain(self, domain: str) -> list[Candidate]:
        normalized_domain = normalize_domain(domain)
        base_url = self.resolve_base_url(normalized_domain)
        if not base_url:
            return []

        sitemap_urls = self.fetch_robots_sitemaps(base_url)
        sitemap_docs, sitemap_pages = self.fetch_sitemap_candidates(sitemap_urls)

        candidates: list[Candidate] = []
        for doc_url in sitemap_docs:
            if same_domain(doc_url, normalized_domain):
                candidate = self.build_candidate(
                    doc_url,
                    normalized_domain,
                    source_page_url="",
                    source_page_title="",
                    link_text="",
                    discovered_via="sitemap",
                    candidate_type="downloadable_file",
                )
                if candidate:
                    candidates.append(candidate)

        crawled, produced_candidates = self.crawl_html(base_url, normalized_domain, sitemap_pages)
        candidates.extend(crawled)

        if self.config.use_playwright_fallback and not produced_candidates:
            candidates.extend(self.maybe_run_playwright(base_url, normalized_domain))

        return dedupe_candidates(candidates)


def classify_candidate(
    *,
    url: str,
    source_page_title: str,
    link_text: str,
    candidate_type: str,
    file_extension: str,
    pdf_page_count: int | None,
    page_text: str = "",
    linked_files: int = 0,
) -> tuple[str, str, int, str]:
    score = 0
    reasons: list[str] = []

    landing_text = page_text[:1000] if candidate_type == "form_landing_page" else ""
    corpus = " ".join(
        part for part in [urlparse(url).path, source_page_title, link_text, landing_text] if part
    )
    positives, negatives = extract_keywords(corpus)

    if positives:
        score += min(6, len(positives) * 2)
        reasons.append("keywords:" + ",".join(positives[:4]))
    if negatives:
        score -= min(8, len(negatives) * 3)
        reasons.append("negative:" + ",".join(negatives[:3]))

    if file_extension in {".pdf", ".doc", ".docx"}:
        score += 2
        reasons.append(f"extension:{file_extension}")
    elif file_extension in {".xls", ".xlsx", ".odt", ".rtf"}:
        score += 1
        reasons.append(f"extension:{file_extension}")

    if candidate_type == "form_landing_page":
        landing_basis = " ".join(part for part in [urlparse(url).path, source_page_title, link_text] if part).lower()
        landing_hit = any(hint in landing_basis for hint in LANDING_PAGE_HINTS)
        if landing_hit:
            score += 2
            reasons.append("landing-keywords")
        if linked_files > 0:
            score += 2
            reasons.append(f"linked-files:{linked_files}")
        if not landing_hit and linked_files == 0:
            score -= 3

    if pdf_page_count is not None:
        reasons.append(f"pages:{pdf_page_count}")
        if pdf_page_count >= 16:
            score -= 6
        elif pdf_page_count >= 9:
            score -= 3
        elif pdf_page_count >= 1:
            score += 1

    if not positives and candidate_type == "downloadable_file" and not file_extension:
        score -= 2

    if pdf_page_count is not None and pdf_page_count >= 16:
        return "info", "low", score, "excluded: long-pdf " + " + ".join(reasons)

    if score >= 6:
        return "form", "high", score, " + ".join(reasons) or "high-score"
    if score >= 3:
        return "possible_form", "medium", score, " + ".join(reasons) or "medium-score"
    if negatives or pdf_page_count and pdf_page_count >= 9:
        return "info", "low", score, "excluded: " + (" + ".join(reasons) or "negative-signals")
    return "non_form", "low", score, "excluded: weak-signals"


def choose_preferred(left: Candidate, right: Candidate) -> Candidate:
    if right.score > left.score:
        return right
    if right.form_confidence == "high" and left.form_confidence != "high":
        return right
    if len(right.classification_reason) > len(left.classification_reason):
        return right
    return left


def dedupe_candidates(candidates: Iterable[Candidate]) -> list[Candidate]:
    deduped: dict[str, Candidate] = {}
    for candidate in candidates:
        key = candidate.form_url
        if key not in deduped:
            deduped[key] = candidate
            continue
        preferred = choose_preferred(deduped[key], candidate)
        merged = Candidate(
            form_url=preferred.form_url,
            form_domain=preferred.form_domain,
            source_page_url=preferred.source_page_url or deduped[key].source_page_url or candidate.source_page_url,
            source_page_title=preferred.source_page_title or deduped[key].source_page_title or candidate.source_page_title,
            link_text=preferred.link_text or deduped[key].link_text or candidate.link_text,
            file_extension=preferred.file_extension or deduped[key].file_extension,
            content_type=preferred.content_type or deduped[key].content_type,
            status_code=preferred.status_code or deduped[key].status_code,
            content_length=preferred.content_length or deduped[key].content_length,
            pdf_page_count=preferred.pdf_page_count or deduped[key].pdf_page_count,
            discovered_via=preferred.discovered_via,
            candidate_type=preferred.candidate_type,
            form_confidence=preferred.form_confidence,
            classification_reason=preferred.classification_reason,
            agency_guess=preferred.agency_guess,
            last_checked_at=preferred.last_checked_at,
            score=preferred.score,
            classification=preferred.classification,
        )
        deduped[key] = merged
    return list(deduped.values())


def load_domains(path: Path) -> list[str]:
    lines = []
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        lines.append(line)
    return lines


def load_checkpoint(path: Path) -> tuple[set[str], list[Candidate]]:
    if not path.exists():
        return set(), []
    payload = json.loads(path.read_text(encoding="utf-8"))
    completed = {normalize_domain(domain) for domain in payload.get("completed_domains", [])}
    rows = []
    for row in payload.get("rows", []):
        rows.append(Candidate(**row, score=0, classification="checkpoint"))
    return completed, rows


def save_checkpoint(path: Path, completed_domains: Iterable[str], rows: Iterable[Candidate]) -> None:
    payload = {
        "completed_domains": sorted(set(completed_domains)),
        "rows": [candidate.to_manifest_row() for candidate in rows],
        "updated_at": now_iso(),
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def write_manifest(path: Path, rows: Iterable[Candidate]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=MANIFEST_COLUMNS)
        writer.writeheader()
        for candidate in rows:
            writer.writerow(candidate.to_manifest_row())


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--domains", required=True, type=Path, help="Path to a newline-delimited domain list.")
    parser.add_argument("--output", required=True, type=Path, help="CSV manifest output path.")
    parser.add_argument("--checkpoint", type=Path, default=Path("data/checkpoints/barbados_forms.json"))
    parser.add_argument("--max-depth", type=int, default=2)
    parser.add_argument("--max-pages-per-domain", type=int, default=100)
    parser.add_argument("--delay-seconds", type=float, default=0.5)
    parser.add_argument("--request-timeout", type=float, default=15.0)
    parser.add_argument("--use-playwright-fallback", action="store_true")
    parser.add_argument("--resume", action=argparse.BooleanOptionalAction, default=True)
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_arg_parser()
    args = parser.parse_args(argv)

    domains = load_domains(args.domains)
    config = DiscoveryConfig(
        max_depth=args.max_depth,
        max_pages_per_domain=args.max_pages_per_domain,
        delay_seconds=args.delay_seconds,
        request_timeout=args.request_timeout,
        use_playwright_fallback=args.use_playwright_fallback,
    )
    discoverer = Discoverer(config=config)

    completed_domains: set[str] = set()
    existing_rows: list[Candidate] = []
    if args.resume:
        completed_domains, existing_rows = load_checkpoint(args.checkpoint)

    all_candidates = dedupe_candidates(existing_rows)
    for domain in domains:
        normalized = normalize_domain(domain)
        if normalized in completed_domains:
            continue
        print(f"Discovering forms for {normalized}...", file=sys.stderr)
        candidates = discoverer.discover_domain(normalized)
        all_candidates = dedupe_candidates([*all_candidates, *candidates])
        completed_domains.add(normalized)
        save_checkpoint(args.checkpoint, completed_domains, all_candidates)

    all_candidates = sorted(all_candidates, key=lambda item: (item.agency_guess, item.form_url))
    write_manifest(args.output, all_candidates)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
