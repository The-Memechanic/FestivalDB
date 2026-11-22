import fs from "fs/promises";
import path from "path";

const TRACKS_FILE = path.join(process.cwd(), "data", "tracks.json");

const SPARK_TRACKS_URL =
  "https://fortnitecontent-website-prod07.ol.epicgames.com/content/api/pages/fortnite-game/spark-tracks";

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
    .map((entry) => entry);
}

function parsePreviewId(track) {
  if (typeof track.qi !== "string") return null;

  try {
    const quicksilver = JSON.parse(track.qi);
    return typeof quicksilver.pid === "string" ? quicksilver.pid : null;
  } catch {
    return null;
  }
}

function transformTrack(entry) {
  const track = entry.track;

  return {
    id: track.sn,
    shortname: track.sn ?? "",
    song: (track.tt ?? "").trim(),
    artist: (track.an ?? "").trim(),
    album: (track.ab ?? "").trim(),
    placeholderId: track.ti ?? null,
    releaseYear: Number.isFinite(track.ry) ? track.ry : null,
    bpm: Number.isFinite(track.mt) ? track.mt : null,
    duration: Number.isFinite(track.dn) ? track.dn : null,
    trackNumber: entry.dn ?? null,
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
    jamLoopMnemonicCode: track.jc ?? null,
    leaderboardEventId: track.su ?? null,
    isrc: track.isrc ?? null,
    esrbRating: track.ar ?? null,
    tapVocalsStartingInstrument: track.siv ?? null,
    bassStartingInstrument: track.sib ?? null,
    drumsStartingInstrument: track.sid ?? null,
    guitarStartingInstrument: track.sig ?? null,
    lipSyncAssetUrl: track.ld ?? null,
    chartUrl: track.mu ?? null,
    genres: track.ge ?? [],
    gameplayTags: track.gt ?? [],
    musicMomentOffset: track.mmo ?? null,
    newUntilDate: track.nu ?? null,
    albumArt: track.au ?? "",
    questThumbnail: track.tb ?? null,
    stageMood: track.sm ?? null,
    animationGenre: track.ag ?? null,
    countInDuration: track.ci ?? null,
    trackType: entry._type ?? track._type ?? null,
    noIndex: entry._noIndex ?? null,
    activeDate: entry._activeDate ?? null,
    locale: entry._locale ?? null,
    templateName: entry._templateName ?? null,
    lastModified: entry.lastModified ?? null,
    catalogTitle: entry._title ?? null,
    previewId: parsePreviewId(track),
  };
}

async function main() {
  const sparkTracks = await fetchSparkTracks();

  const tracks = {};

  for (const entry of sparkTracks) {
    const track = entry.track;
    if (!track.sn) continue;

    tracks[track.sn] = transformTrack(entry);
  }

  await save(tracks);

  console.log(`Finished. Wrote ${Object.keys(tracks).length} tracks.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});