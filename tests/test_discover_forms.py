import unittest

from scripts.discover_forms import (
    Candidate,
    DiscoveryConfig,
    Discoverer,
    classify_candidate,
    dedupe_candidates,
    extract_sitemaps_from_robots,
    normalize_url,
    parse_sitemap_xml,
)


class FakeResponse:
    def __init__(
        self,
        url,
        status_code=200,
        text="",
        content=b"",
        headers=None,
    ):
        self.url = url
        self.status_code = status_code
        self.text = text
        self.content = content or text.encode("utf-8")
        self.headers = headers or {}

    @property
    def ok(self):
        return 200 <= self.status_code < 300

    def iter_content(self, chunk_size=8192):
        for index in range(0, len(self.content), chunk_size):
            yield self.content[index:index + chunk_size]


class FakeSession:
    def __init__(self, routes):
        self.routes = routes
        self.headers = {}

    def request(self, method, url, **kwargs):
        key = (method.upper(), normalize_url(url))
        if key not in self.routes:
            raise AssertionError(f"Unexpected request: {key}")
        response = self.routes[key]
        if isinstance(response, Exception):
            raise response
        return response


def make_candidate(url, reason, score=6, confidence="high"):
    return Candidate(
        form_url=url,
        form_domain="example.gov.bb",
        source_page_url="https://example.gov.bb/forms",
        source_page_title="Forms",
        link_text="Application form",
        file_extension=".pdf",
        content_type="application/pdf",
        status_code=200,
        content_length=1000,
        pdf_page_count=2,
        discovered_via="crawl",
        candidate_type="downloadable_file",
        form_confidence=confidence,
        classification_reason=reason,
        agency_guess="Example",
        last_checked_at="2026-04-17T10:00:00+00:00",
        score=score,
        classification="form",
    )


class DiscoverFormsTests(unittest.TestCase):
    def test_extract_sitemaps_from_robots(self):
        robots = """
        User-agent: *
        Sitemap: https://example.gov.bb/sitemap.xml
        Sitemap: https://example.gov.bb/alt.xml
        """
        self.assertEqual(
            extract_sitemaps_from_robots(robots),
            [
                "https://example.gov.bb/sitemap.xml",
                "https://example.gov.bb/alt.xml",
            ],
        )

    def test_parse_sitemap_xml_collects_docs_and_pages(self):
        xml = b"""<?xml version="1.0" encoding="UTF-8"?>
        <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
          <url><loc>https://example.gov.bb/forms/apply.html</loc></url>
          <url><loc>https://example.gov.bb/files/app-form.pdf</loc></url>
        </urlset>
        """
        docs, pages = parse_sitemap_xml(xml)
        self.assertEqual(docs, ["https://example.gov.bb/files/app-form.pdf"])
        self.assertEqual(pages, ["https://example.gov.bb/forms/apply.html"])

    def test_classify_short_pdf_form(self):
        classification, confidence, score, reason = classify_candidate(
            url="https://example.gov.bb/files/application-form.pdf",
            source_page_title="Application form",
            link_text="Download application form",
            candidate_type="downloadable_file",
            file_extension=".pdf",
            pdf_page_count=3,
        )
        self.assertEqual(classification, "form")
        self.assertEqual(confidence, "high")
        self.assertGreaterEqual(score, 6)
        self.assertIn("pages:3", reason)

    def test_classify_long_pdf_as_info(self):
        classification, confidence, score, reason = classify_candidate(
            url="https://example.gov.bb/files/application-guide.pdf",
            source_page_title="Application guide",
            link_text="Guide",
            candidate_type="downloadable_file",
            file_extension=".pdf",
            pdf_page_count=42,
        )
        self.assertEqual(classification, "info")
        self.assertEqual(confidence, "low")
        self.assertIn("long-pdf", reason)

    def test_classify_medium_length_pdf_possible_form(self):
        classification, confidence, score, _ = classify_candidate(
            url="https://example.gov.bb/files/permit-application.pdf",
            source_page_title="Permit application",
            link_text="Permit application form",
            candidate_type="downloadable_file",
            file_extension=".pdf",
            pdf_page_count=12,
        )
        self.assertEqual(classification, "possible_form")
        self.assertEqual(confidence, "medium")
        self.assertGreaterEqual(score, 3)

    def test_dedupe_prefers_higher_score(self):
        low = make_candidate("https://example.gov.bb/form.pdf", "medium", score=3, confidence="medium")
        high = make_candidate("https://example.gov.bb/form.pdf", "high", score=8, confidence="high")
        deduped = dedupe_candidates([low, high])
        self.assertEqual(len(deduped), 1)
        self.assertEqual(deduped[0].classification_reason, "high")
        self.assertEqual(deduped[0].form_confidence, "high")

    def test_discover_domain_from_sitemap_and_crawl(self):
        routes = {
            ("GET", "https://example.gov.bb/"): FakeResponse(
                "https://example.gov.bb/",
                text="<html><head><title>Home</title></head><body><a href='/forms'>Forms</a></body></html>",
                headers={"Content-Type": "text/html"},
            ),
            ("GET", "https://example.gov.bb/robots.txt"): FakeResponse(
                "https://example.gov.bb/robots.txt",
                text="Sitemap: https://example.gov.bb/sitemap.xml",
                headers={"Content-Type": "text/plain"},
            ),
            ("GET", "https://example.gov.bb/sitemap.xml"): FakeResponse(
                "https://example.gov.bb/sitemap.xml",
                content=b"""<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
                    <url><loc>https://example.gov.bb/forms</loc></url>
                    <url><loc>https://example.gov.bb/files/application-form.pdf</loc></url>
                </urlset>""",
                headers={"Content-Type": "application/xml"},
            ),
            ("HEAD", "https://example.gov.bb/files/application-form.pdf"): FakeResponse(
                "https://example.gov.bb/files/application-form.pdf",
                headers={"Content-Type": "application/pdf", "Content-Length": "1234"},
            ),
            ("GET", "https://example.gov.bb/files/application-form.pdf"): FakeResponse(
                "https://example.gov.bb/files/application-form.pdf",
                content=b"%PDF-1.4\n1 0 obj\n<< /Type /Page >>\nendobj\n2 0 obj\n<< /Type /Page >>\nendobj",
                headers={"Content-Type": "application/pdf", "Content-Length": "1234"},
            ),
            ("GET", "https://example.gov.bb/forms"): FakeResponse(
                "https://example.gov.bb/forms",
                text="""
                    <html>
                    <head><title>Application forms</title></head>
                    <body>
                      <a href="/files/application-form.pdf">Download application form</a>
                    </body>
                    </html>
                """,
                headers={"Content-Type": "text/html"},
            ),
        }
        discoverer = Discoverer(
            session=FakeSession(routes),
            config=DiscoveryConfig(delay_seconds=0.0),
        )
        candidates = discoverer.discover_domain("example.gov.bb")
        self.assertEqual(len(candidates), 2)
        file_candidates = [c for c in candidates if c.candidate_type == "downloadable_file"]
        landing_candidates = [c for c in candidates if c.candidate_type == "form_landing_page"]
        self.assertEqual(len(file_candidates), 1)
        self.assertEqual(len(landing_candidates), 1)
        self.assertEqual(file_candidates[0].pdf_page_count, 2)
        self.assertEqual(file_candidates[0].form_confidence, "high")
        self.assertEqual(landing_candidates[0].form_confidence, "high")


if __name__ == "__main__":
    unittest.main()
