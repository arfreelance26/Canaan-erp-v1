"""Every endpoint must have been called SUCCESSFULLY (2xx) by some test.

Runs last (file name). A new endpoint without a test fails this until one is
written. Only checked when the whole suite runs — a partial run (one file,
-k ...) can't have covered everything, so it's skipped then."""
import os

import pytest

from endpoints import HITS, succeeded

# Endpoints a test can't make succeed, and why. Keep this list short.
CANNOT_SUCCEED = {
}


def test_every_endpoint_succeeded_at_least_once(request, endpoints):
    tests_dir = os.path.dirname(__file__)
    every_file = {f for f in os.listdir(tests_dir) if f.startswith("test_") and f.endswith(".py")}
    collected = {os.path.basename(str(item.fspath)) for item in request.session.items}
    if request.config.option.keyword or request.config.option.markexpr or collected != every_file:
        pytest.skip("partial run — coverage is only checked when the whole suite runs")

    missing = []
    for e in endpoints:
        if (e.method, e.path) in CANNOT_SUCCEED or succeeded(e.method, e.path):
            continue
        seen = sorted(set(HITS.get((e.method, e.path), [])))
        missing.append(f"{e.id}  (statuses seen: {seen or 'never called'})")
    assert not missing, f"{len(missing)} endpoint(s) never succeeded:\n" + "\n".join(missing)
