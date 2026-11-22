import base64
import json
import subprocess
import tempfile
from pathlib import Path
import xml.etree.ElementTree as ET

import requests

TRACKS_API = (
    "https://fortnitecontent-website-prod07.ol.epicgames.com/"
    "content/api/pages/fortnite-game/spark-tracks"
)
PREVIEW_API = "https://cdn.qstv.on.epicgames.com/"


def local_name(tag: str) -> str:
    """Strip an optional XML namespace from a tag."""
    return tag.rsplit("}", 1)[-1]


def fetch_preview(title: str, output: str = "preview.ogg") -> None:
    # Fetch track metadata and find a title match.
    response = requests.get(TRACKS_API, timeout=20)
    response.raise_for_status()
    data = response.json()

    tracks = [
        item for item in data.values()
        if isinstance(item, dict) and isinstance(item.get("track"), dict)
    ]
    match = next(
        (item for item in tracks
         if item["track"].get("tt", "").casefold() == title.casefold()),
        None,
    )
    if match is None:
        raise SystemExit(f"Track not found: {title}")

    # The track's `qi` field contains JSON with the preview ID (`pid`).
    quicksilver = json.loads(match["track"]["qi"])
    pid = quicksilver["pid"]

    # Fetch and decode the DASH manifest.
    response = requests.get(PREVIEW_API + pid, timeout=20)
    response.raise_for_status()
    manifest_bytes = base64.b64decode(response.json()["playlist"])
    root = ET.fromstring(manifest_bytes)

    # The repo's manifest format has a top-level BaseURL and an
    # initialization-file BaseURL inside the Representation.
    elements = list(root.iter())
    base_url = next(
        (el.text.strip() for el in elements
         if local_name(el.tag) == "BaseURL" and el.text and el.text.strip().startswith("http")),
        None,
    )
    if not base_url:
        raise RuntimeError("Manifest did not contain the expected absolute BaseURL.")

    # Keep a local copy of the manifest; FFmpeg follows its remote BaseURL
    # to retrieve the DASH initialization data and audio segments.
    with tempfile.TemporaryDirectory() as temp_dir:
        manifest_path = Path(temp_dir) / "preview.mpd"
        manifest_path.write_bytes(manifest_bytes)

        subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-i", str(manifest_path),
                "-t", "30",
                "-vn",
                "-c:a", "libopus",
                "-ar", "48000",
                output,
            ],
            check=True,
        )

    print(f"Saved preview for {title!r} (pid {pid}) to {output}")


if __name__ == "__main__":
    fetch_preview("")