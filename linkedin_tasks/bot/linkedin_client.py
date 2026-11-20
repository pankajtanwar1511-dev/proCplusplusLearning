"""Minimal LinkedIn REST client for PDF document posts and comments.

Adapted from the proven client in the autolinkedin repo, with three fixes:
  - create_document_post() returns the post URN (needed to add the first comment)
  - the post URN is URL-encoded in the comments endpoint
  - retries with backoff on 429 / 5xx, and a token check that works with
    posting-only scopes (openid/profile + w_member_social)

Scopes needed: w_member_social (post + comment), openid + profile (token check).
"""
import logging
import os
import time
from datetime import datetime, timedelta
from pathlib import Path
from urllib.parse import quote

import requests

log = logging.getLogger("linkedin")
REST = "https://api.linkedin.com/rest"


class TokenError(RuntimeError):
    """The access token is missing, expired or revoked."""


class PostRejected(RuntimeError):
    """LinkedIn answered 4xx to post creation: the post was definitely NOT created."""


class LinkedInClient:
    def __init__(self, access_token=None, author_urn=None, api_version=None):
        self.token = access_token or os.getenv("LINKEDIN_ACCESS_TOKEN")
        self.author = author_urn or os.getenv("LINKEDIN_USER_ID")
        if not self.token:
            raise TokenError("LINKEDIN_ACCESS_TOKEN is not set")
        # LINKEDIN_USER_ID is optional: without it the member id is looked up from the
        # token (needs the openid + profile scopes), so only one secret is required.
        if self.author and not self.author.startswith("urn:li:"):
            raise ValueError("LINKEDIN_USER_ID must look like urn:li:person:XXXX")
        # LinkedIn publishes monthly API versions; last month's is always live.
        self.version = api_version or os.getenv("LINKEDIN_API_VERSION") or \
            (datetime.now() - timedelta(days=30)).strftime("%Y%m")

    def _headers(self, json_body=True):
        h = {"Authorization": f"Bearer {self.token}", "Linkedin-Version": self.version,
             "X-Restli-Protocol-Version": "2.0.0"}
        if json_body:
            h["Content-Type"] = "application/json"
        return h

    def _request(self, method, url, attempts=4, **kw):
        for i in range(attempts):
            r = requests.request(method, url, timeout=kw.pop("timeout", 60), **kw)
            if r.status_code == 401:
                raise TokenError(f"LinkedIn rejected the token (401): {r.text[:200]}")
            if r.status_code == 429 or r.status_code >= 500:
                wait = 5 * 2 ** i
                log.warning("LinkedIn %s on %s, retrying in %ss", r.status_code, url.split('?')[0], wait)
                time.sleep(wait)
                continue
            return r
        return r

    def check_token(self):
        """Return the member's display name; raise TokenError if the token is not usable."""
        r = self._request("GET", "https://api.linkedin.com/v2/userinfo",
                          headers={"Authorization": f"Bearer {self.token}"})
        if r.status_code == 200:
            info = r.json()
            sub = info.get("sub")
            if not self.author and sub:
                self.author = f"urn:li:person:{sub}"
            elif sub and self.author.startswith("urn:li:person:") and self.author != f"urn:li:person:{sub}":
                raise ValueError(f"LINKEDIN_USER_ID does not match the token's member (urn:li:person:{sub})")
            return info.get("name", "member")
        if r.status_code == 403:
            # Token valid but without openid/profile scopes: posting can still work if the id is set.
            if not self.author:
                raise TokenError("Token lacks openid/profile scopes and LINKEDIN_USER_ID is not set")
            log.warning("Token has no profile scope; skipping identity check")
            return "member"
        raise TokenError(f"Token check failed: {r.status_code} {r.text[:200]}")

    def upload_document(self, pdf_path):
        init = self._request("POST", f"{REST}/documents?action=initializeUpload", headers=self._headers(),
                             json={"initializeUploadRequest": {"owner": self.author}})
        if init.status_code != 200:
            raise RuntimeError(f"Document init failed: {init.status_code} {init.text[:300]}")
        value = init.json()["value"]
        data = Path(pdf_path).read_bytes()
        up = self._request("PUT", value["uploadUrl"], timeout=180, data=data,
                           headers={"Authorization": f"Bearer {self.token}", "Content-Type": "application/pdf"})
        if up.status_code not in (200, 201):
            raise RuntimeError(f"Document upload failed: {up.status_code} {up.text[:300]}")
        log.info("Uploaded %s (%d KB) as %s", Path(pdf_path).name, len(data) // 1024, value["document"])
        return value["document"]

    def upload_video(self, mp4_path, wait_secs=600):
        """Videos API: initialize, PUT each part (collect ETags), finalize, then wait until
        LinkedIn has processed the video (status AVAILABLE) so the post shows it."""
        data = Path(mp4_path).read_bytes()
        init = self._request("POST", f"{REST}/videos?action=initializeUpload", headers=self._headers(),
                             json={"initializeUploadRequest": {"owner": self.author, "fileSizeBytes": len(data),
                                                               "uploadCaptions": False, "uploadThumbnail": False}})
        if init.status_code != 200:
            raise RuntimeError(f"Video init failed: {init.status_code} {init.text[:300]}")
        v = init.json()["value"]
        etags = []
        for part in v["uploadInstructions"]:
            chunk = data[part["firstByte"]:part["lastByte"] + 1]
            up = self._request("PUT", part["uploadUrl"], timeout=300, data=chunk,
                               headers={"Content-Type": "application/octet-stream"})
            if up.status_code not in (200, 201):
                raise RuntimeError(f"Video part upload failed: {up.status_code} {up.text[:300]}")
            etags.append(up.headers.get("etag") or up.headers.get("ETag"))
        fin = self._request("POST", f"{REST}/videos?action=finalizeUpload", headers=self._headers(),
                            json={"finalizeUploadRequest": {"video": v["video"], "uploadToken": v.get("uploadToken", ""),
                                                            "uploadedPartIds": etags}})
        if fin.status_code not in (200, 201):
            raise RuntimeError(f"Video finalize failed: {fin.status_code} {fin.text[:300]}")
        log.info("Uploaded %s (%d KB) as %s; waiting for processing", Path(mp4_path).name, len(data) // 1024, v["video"])
        deadline = time.time() + wait_secs
        while time.time() < deadline:
            st = self._request("GET", f"{REST}/videos/{quote(v['video'], safe='')}", headers=self._headers(False))
            status = st.json().get("status") if st.status_code == 200 else f"HTTP {st.status_code}"
            if status == "AVAILABLE":
                log.info("Video processed")
                return v["video"]
            if status in ("PROCESSING_FAILED",):
                raise RuntimeError(f"LinkedIn could not process the video: {st.text[:300]}")
            time.sleep(10)
        log.warning("Video still processing after %ss; posting anyway", wait_secs)
        return v["video"]

    def create_document_post(self, commentary, document_urn, title=None):
        # title=None: no title, so LinkedIn draws no title bar over the first slide.
        media = {"id": document_urn}
        if title:
            media["title"] = title
        body = {
            "author": self.author, "commentary": commentary, "visibility": "PUBLIC",
            "distribution": {"feedDistribution": "MAIN_FEED", "targetEntities": [],
                             "thirdPartyDistributionChannels": []},
            "content": {"media": media},
            "lifecycleState": "PUBLISHED", "isReshareDisabledByAuthor": False,
        }
        r = self._request("POST", f"{REST}/posts", headers=self._headers(), json=body, attempts=1)
        if 400 <= r.status_code < 500:
            raise PostRejected(f"Post creation rejected: {r.status_code} {r.text[:300]}")
        if r.status_code != 201:   # 5xx: LinkedIn may still have created it
            raise RuntimeError(f"Post creation failed: {r.status_code} {r.text[:300]}")
        urn = r.headers.get("x-restli-id")
        log.info("Post created: %s", urn)
        return urn

    def add_comment(self, post_urn, text):
        """Comment as the member. Self-serve apps (Share on LinkedIn, w_member_social) use the
        unversioned /v2 endpoint; the versioned /rest one needs Community Management API
        access and returns 403 otherwise. Try /v2 first, then /rest."""
        enc = quote(post_urn, safe="")
        attempts = [
            ("v2", f"https://api.linkedin.com/v2/socialActions/{enc}/comments",
             {"Authorization": f"Bearer {self.token}", "Content-Type": "application/json",
              "X-Restli-Protocol-Version": "2.0.0"}),
            ("rest", f"{REST}/socialActions/{enc}/comments", self._headers()),
        ]
        errors = []
        for name, url, headers in attempts:
            r = self._request("POST", url, headers=headers,
                              json={"actor": self.author, "object": post_urn, "message": {"text": text}})
            if r.status_code in (200, 201):
                log.info("First comment added (%s endpoint)", name)
                return
            errors.append(f"{name}: {r.status_code} {r.text[:300]}")
        raise RuntimeError("Comment failed. " + " | ".join(errors))


def post_url(post_urn):
    return f"https://www.linkedin.com/feed/update/{post_urn}/"
