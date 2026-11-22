import fs from "fs/promises";
import path from "path";

export type TrackDifficulty = {
  vocals: number;
  guitar: number;
  bass: number;
  drums: number;
  plasticVocals: number;
  plasticGuitar: number;
  plasticBass: number;
  plasticDrums: number;
};

export type TrackRow = {
  id: string;
  shortname: string;
  song: string;
  artist: string;
  album: string;
  placeholderId: string | number | null;
  releaseYear: number | null;
  bpm: number | null;
  duration: number | null;
  trackNumber: string | number | null;
  difficulty: TrackDifficulty;
  genres: string[];
  gameplayTags: string[];
  albumArt: string;
  newUntilDate: string | null;
  key: string;
  mode: string;
  jamLoopMnemonicCode: string | null;
  leaderboardEventId: string | number | null;
  isrc: string | null;
  esrbRating: string | null;
  tapVocalsStartingInstrument: string | null;
  bassStartingInstrument: string | null;
  drumsStartingInstrument: string | null;
  guitarStartingInstrument: string | null;
  lipSyncAssetUrl: string | null;
  chartUrl: string | null;
  musicMomentOffset: number | null;
  questThumbnail: string | null;
  stageMood: string | null;
  animationGenre: string | null;
  countInDuration: number | null;
  trackType: string | null;
  noIndex: boolean | null;
  activeDate: string | null;
  locale: string | null;
  templateName: string | null;
  lastModified: string | null;
  catalogTitle: string | null;
  previewId: string | null;
};

export type TrackDataResponse = {
  rows: TrackRow[];
  metadata: {
    lastUpdated: string;
  } | null;
};

const TRACKS_FILE = path.join(process.cwd(), "data", "tracks.json");

export const TRACK_COLUMNS = [
  { key: "song", label: "Song" },
  { key: "artist", label: "Artist" },
  { key: "album", label: "Album" },
  { key: "releaseYear", label: "Release year" },
  { key: "bpm", label: "BPM" },
  { key: "key", label: "Key" },
  { key: "duration", label: "Duration" },
  { key: "difficulty", label: "Difficulty" },
  { key: "genres", label: "Genres" },
  { key: "added", label: "Added" },
] as const;

export type TrackColumnKey = (typeof TRACK_COLUMNS)[number]["key"];

export async function fetchTrackData(): Promise<TrackDataResponse> {
  const raw = await fs.readFile(TRACKS_FILE, "utf-8");
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  
  // Extract metadata
  const metadata = parsed._metadata as { lastUpdated: string } | undefined;
  
  // Remove metadata from the rows
  delete parsed._metadata;
  
  // Convert the remaining object values to an array of normalized TrackRow records.
  const rows = Object.values(parsed) as TrackRow[];
  
  return {
    rows,
    metadata: metadata || null
  };
}