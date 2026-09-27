"""Fetch pinned public source for evaluation. Never installs or executes repository code."""
import io
import json
import tarfile
import urllib.request
from pathlib import Path, PurePosixPath

ROOT = Path(__file__).resolve().parents[1]


def main():
    for repo in json.loads((ROOT / "benchmarks" / "repositories.json").read_text()):
        destination = (ROOT / ".cache" / "repositories" / repo["name"]).resolve()
        marker = destination / "source.json"
        if marker.exists() and json.loads(marker.read_text())["revision"] == repo["revision"]:
            print(f"Cached {repo['name']}", flush=True)
            continue
        request = urllib.request.Request(
            f"https://api.github.com/repos/{repo['repo']}/tarball/{repo['revision']}",
            headers={"User-Agent": "codestrata-retrieval-evaluation"},
        )
        with urllib.request.urlopen(request, timeout=60) as response:
            archive = response.read(30_000_001)
        if len(archive) > 30_000_000:
            raise ValueError("Benchmark archive exceeds 30 MB")
        files = 0
        with tarfile.open(fileobj=io.BytesIO(archive), mode="r:gz") as tar:
            for member in tar:
                if not member.isfile() or member.size > 2_000_000:
                    continue
                relative = PurePosixPath(*PurePosixPath(member.name).parts[1:])
                selected = str(relative).endswith(".js") and any(str(relative).startswith(prefix) for prefix in repo["prefixes"])
                if not selected and relative.name.lower() not in ["license", "license.md", "license.txt"]:
                    continue
                target = (destination / str(relative)).resolve()
                if not target.is_relative_to(destination):
                    raise ValueError("Unsafe archive path")
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(tar.extractfile(member).read())
                files += int(selected)
        marker.write_text(json.dumps({**repo, "files": files}, indent=2), encoding="utf-8")
        print(f"Prepared {repo['name']}: {files} JavaScript files at {repo['revision']}", flush=True)


if __name__ == "__main__":
    main()
