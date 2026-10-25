"""The API's endpoint list (from its OpenAPI schema) and a record of which
endpoints the tests have called successfully — test_zz_coverage.py fails if
any endpoint was never exercised."""
import re
from collections import defaultdict
from dataclasses import dataclass, field

from fastapi.testclient import TestClient


@dataclass(frozen=True)
class Endpoint:
    method: str
    path: str
    params: tuple = field(default=())      # ((name, "integer"|"string"), ...)
    regex: re.Pattern = field(default=None, compare=False, hash=False)

    @property
    def id(self) -> str:
        return f"{self.method} {self.path}"


def all_endpoints(app) -> list[Endpoint]:
    """Every endpoint, from the OpenAPI schema — the same on every FastAPI
    version (newer ones nest included routers instead of listing their routes)."""
    out = []
    for path, ops in app.openapi()["paths"].items():
        pattern = re.compile("^" + re.sub(r"\{(\w+)(:\w+)?\}", r"[^/]+", path) + "/?$")
        for method, op in ops.items():
            params = tuple(
                (p["name"], p.get("schema", {}).get("type", "string"))
                for p in op.get("parameters", []) if p.get("in") == "path"
            )
            out.append(Endpoint(method.upper(), path, params, pattern))
    return out


# (METHOD, path template) -> statuses seen from the recording client
HITS: dict[tuple[str, str], list[int]] = defaultdict(list)


class RecordingClient(TestClient):
    """TestClient that notes which endpoint each request hit and its status."""

    endpoints: list[Endpoint] = []

    def _template(self, method: str, url: str) -> str | None:
        path = url.split("?", 1)[0]
        matches = [e for e in self.endpoints if e.method == method and e.regex.match(path)]
        # Prefer the most literal match ("/todos/completed" over "/todos/{todo_id}").
        matches.sort(key=lambda e: e.path.count("{"))
        return matches[0].path if matches else None

    def request(self, method, url, *args, **kwargs):
        response = super().request(method, url, *args, **kwargs)
        template = self._template(method.upper(), str(url))
        if template:
            HITS[(method.upper(), template)].append(response.status_code)
        return response


def succeeded(method: str, path: str) -> bool:
    return any(200 <= s < 300 for s in HITS.get((method, path), []))
