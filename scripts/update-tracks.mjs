import fs from "fs/promises";
import path from "path";

const TRACKS_FILE = path.join(process.cwd(), "data", "tracks.json");

const SPARK_TRACKS_URL =
  "https://fortnitecontent-website-prod07.ol.epicgames.com/content/api/pages/fortnite-game/spark-tracks";

const REQUEST_DELAY_MS = 5000;

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function save(data) {
  await fs.mkdir(path.dirname(TRACKS_FILE), { recursive: true });

  const output = {
    _metadata: {
      lastUpdated: new Date().toISOString(),
    },
    ...data,
  };

  await fs.writeFile(
    TRACKS_FILE,
    JSON.stringify(output, null, 2),
    "utf8"
  );
}

async function readExisting() {
  try {
    const raw = await fs.readFile(TRACKS_FILE, "utf8");
    const parsed = JSON.parse(raw);

    delete parsed._metadata;

    return parsed;
  } catch {
    return {};
  }
}

async function fetchSparkTracks() {
  const res = await fetch(SPARK_TRACKS_URL);

  if (!res.ok) {
    throw new Error(
      `Failed to fetch spark-tracks (status ${res.status}).`
    );
  }

  const payload = await res.json();

  return Object.values(payload)
    .filter((entry) => entry?.track)
    .map((entry) => entry.track);
}

function transformTrack(track, existing) {
  return {
    id: track.sn,
    song: (track.tt ?? "").trim(),
    artist: (track.an ?? "").trim(),
    album: (track.ab ?? "").trim(),
    releaseYear: Number.isFinite(track.ry) ? track.ry : null,
    bpm: Number.isFinite(track.mt) ? track.mt : null,
    duration: Number.isFinite(track.dn) ? track.dn : null,
    difficulty: {
      vocals: track.in?.vl ?? 0,
      guitar: track.in?.gr ?? 0,
      bass: track.in?.ba ?? 0,
      drums: track.in?.ds ?? 0,
      plasticVocals: track.in?.bd ?? 0,
      plasticGuitar: track.in?.pg ?? 0,
      plasticBass: track.in?.pb ?? 0,
      plasticDrums: track.in?.pd ?? 0,
    },
    key: track.mk ?? "",
    mode: track.mm ?? "",
    genres: track.ge ?? [],
    gameplayTags: track.gt ?? [],
    albumArt: track.au ?? "",
    added: track.nu ?? null,
    previewUrl: existing?.previewUrl ?? null,
  };
}

async function fetchPreviewUrl(track) {
  let backoff = 5000;

  while (true) {
    try {
      const query = encodeURIComponent(
        `${track.artist} ${track.song}`
      );

      const url =
        `https://itunes.apple.com/search?term=${query}` +
        "&media=music&entity=song&limit=1";

      const res = await fetch(url);

      if (res.status === 403 || res.status === 429) {
        console.warn(
          `[RATE LIMITED] ${track.artist} - ${track.song}`
        );
        console.warn(`Sleeping ${backoff / 1000}s...`);

        await sleep(backoff);

        backoff = Math.min(backoff * 2, 30 * 60 * 1000);
        continue;
      }

      if (!res.ok) {
        console.warn(
          `[HTTP ${res.status}] ${track.artist} - ${track.song}`
        );
        return null;
      }

      const text = await res.text();

      let json;

      try {
        json = JSON.parse(text);
      } catch {
        console.warn(
          `[INVALID JSON] ${track.artist} - ${track.song}`
        );
        return null;
      }

      if (!json.results?.length) {
        console.log(
          `[NO MATCH] ${track.artist} - ${track.song}`
        );
        return null;
      }

      const result = json.results[0];

      console.log(
        `Matched "${track.artist} - ${track.song}" -> "${result.artistName} - ${result.trackName}"`
      );

      if (!result.previewUrl) {
        console.log("No preview URL in iTunes result.");
        return null;
      }

      return result.previewUrl;
    } catch (err) {
      console.error(err);

      console.warn(`Retrying in ${backoff / 1000}s...`);

      await sleep(backoff);

      backoff = Math.min(backoff * 2, 30 * 60 * 1000);
    }
  }
}

function canonicalize(obj) {
  if (Array.isArray(obj)) return obj.map(canonicalize);
  if (obj && typeof obj === "object") {
    return Object.keys(obj)
      .sort()
      .reduce((acc, key) => {
        acc[key] = canonicalize(obj[key]);
        return acc;
      }, {});
  }
  return obj;
}

function isEqual(a, b) {
  return JSON.stringify(canonicalize(a)) === JSON.stringify(canonicalize(b));
}

async function main() {
  const skipPreviews = process.argv.includes("--skip-previews");
  const existing = await readExisting();

  const sparkTracks = await fetchSparkTracks();

  const tracks = {};

  for (const track of sparkTracks) {
    if (!track.sn) continue;

    tracks[track.sn] = transformTrack(
      track,
      existing[track.sn]
    );
  }

  if (!isEqual(existing, tracks)) {
    await save(tracks);
    console.log("Track catalog changed — saved.\n");
  } else {
    console.log("No catalog changes detected — skipping save.\n");
  }

  if (skipPreviews) {
    console.log("Skipping preview URL lookups (--skip-previews).");
    console.log(`Finished. Wrote ${Object.keys(tracks).length} tracks.`);
    return;
  }

  const excludedArtists = [
    "epic games",
    "l1",
    "tasty bois",
    "john williams",
    "bigger story music",
  ];

  // These are songs that iTunes simply does not have so tough luck
  const excludedSongs = [
    "futw",
    "blue english",
    "rottweiler",
    "iloveitiloveitiloveit",
  ]

  const pending = Object.values(tracks).filter((track) => {
    const artist = track.artist.toLowerCase();
    const song = track.song.toLowerCase();

    return (
      !excludedArtists.some((name) => artist.includes(name)) &&
      !excludedSongs.some((name) => song.includes(name)) &&
      !track.previewUrl
    );
  });

  console.log(
    `${pending.length} tracks still need preview URLs.\n`
  );

  for (let i = 0; i < pending.length; i++) {
    const track = pending[i];

    console.log(
      `[${i + 1}/${pending.length}] ${track.artist} - ${track.song}`
    );

    const preview = await fetchPreviewUrl(track);

    if (preview) {
      tracks[track.id].previewUrl = preview;

      console.log(`✓ Preview found`);
      console.log(preview);

      // Save immediately so no progress is lost.
      await save(tracks);
    } else {
      console.log("✗ No preview available");
    }

    await sleep(REQUEST_DELAY_MS);

    console.log("");
  }

  console.log(
    `Finished. Wrote ${Object.keys(tracks).length} tracks.`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});