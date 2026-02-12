"""API Client module for making HTTP requests."""

from typing import Any, Optional
from urllib.parse import urljoin

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry


class APIClient:
    """A flexible API client for making HTTP requests.

    Args:
        base_url: The base URL for all API requests.
        timeout: Default timeout for requests in seconds.
        headers: Default headers to include in all requests.
        retries: Number of retries for failed requests.
    """

    def __init__(
        self,
        base_url: str,
        timeout: int = 30,
        headers: Optional[dict[str, str]] = None,
        retries: int = 3,
    ):
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self.session = requests.Session()

        if headers:
            self.session.headers.update(headers)

        retry_strategy = Retry(
            total=retries,
            backoff_factor=0.5,
            status_forcelist=[429, 500, 502, 503, 504],
        )
        adapter = HTTPAdapter(max_retries=retry_strategy)
        self.session.mount("http://", adapter)
        self.session.mount("https://", adapter)

    def _build_url(self, endpoint: str) -> str:
        """Build full URL from endpoint."""
        if endpoint.startswith(("http://", "https://")):
            return endpoint
        return urljoin(self.base_url + "/", endpoint.lstrip("/"))

    def _request(
        self,
        method: str,
        endpoint: str,
        **kwargs: Any,
    ) -> requests.Response:
        """Make an HTTP request.

        Args:
            method: HTTP method (GET, POST, PUT, DELETE, etc.).
            endpoint: API endpoint or full URL.
            **kwargs: Additional arguments passed to requests.

        Returns:
            Response object from the request.

        Raises:
            requests.RequestException: If the request fails.
        """
        url = self._build_url(endpoint)
        kwargs.setdefault("timeout", self.timeout)
        response = self.session.request(method, url, **kwargs)
        response.raise_for_status()
        return response

    def get(self, endpoint: str, params: Optional[dict] = None, **kwargs: Any) -> requests.Response:
        """Make a GET request."""
        return self._request("GET", endpoint, params=params, **kwargs)

    def post(self, endpoint: str, data: Optional[dict] = None, json: Optional[dict] = None, **kwargs: Any) -> requests.Response:
        """Make a POST request."""
        return self._request("POST", endpoint, data=data, json=json, **kwargs)

    def put(self, endpoint: str, data: Optional[dict] = None, json: Optional[dict] = None, **kwargs: Any) -> requests.Response:
        """Make a PUT request."""
        return self._request("PUT", endpoint, data=data, json=json, **kwargs)

    def patch(self, endpoint: str, data: Optional[dict] = None, json: Optional[dict] = None, **kwargs: Any) -> requests.Response:
        """Make a PATCH request."""
        return self._request("PATCH", endpoint, data=data, json=json, **kwargs)

    def delete(self, endpoint: str, **kwargs: Any) -> requests.Response:
        """Make a DELETE request."""
        return self._request("DELETE", endpoint, **kwargs)

    def set_auth_token(self, token: str, prefix: str = "Bearer") -> None:
        """Set authorization header with token."""
        self.session.headers["Authorization"] = f"{prefix} {token}"

    def set_header(self, key: str, value: str) -> None:
        """Set a custom header."""
        self.session.headers[key] = value

    def close(self) -> None:
        """Close the session."""
        self.session.close()

    def __enter__(self) -> "APIClient":
        return self

    def __exit__(self, *args: Any) -> None:
        self.close()
