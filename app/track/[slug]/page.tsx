"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useRef } from "react";
import { useParams } from "next/navigation";
import type { TrackRow } from "@/lib/fetchTracks";
import { getTrackSlug, matchesTrackSlug } from "@/lib/trackSlug";
import { AudioPlayer } from "@/components/AudioPlayer";
import { formatKeyLabel } from "@/lib/musicKey";

const HIDDEN_KEYS = new Set([
  "song",
  "artist",
  "albumArt",
  "id",
  "key",
  "mode",
  "difficulty",
  "gameplayTags",
  "previewUrl",
]);

const DETAIL_ORDER = [
  "duration",
  "key",
  "bpm",
  "releaseYear",
  "added",
  "album",
  "genres",
] as const;

const DIFFICULTY_ORDER = [
  "vocals",
  "guitar",
  "bass",
  "drums",
  "plasticVocals",
  "plasticGuitar",
  "plasticBass",
  "plasticDrums",
] as const;

const DIFFICULTY_MAX = 7;
const DIFFICULTY_DISPLAY_OFFSET = 1; // raw API 0–6 -> displayed 1–7

const LABEL_OVERRIDES: Record<string, string> = {
  plasticVocals: "Pro Vocals",
  plasticGuitar: "Pro Guitar",
  plasticBass: "Pro Bass",
  plasticDrums: "Pro Drums",
  duration: "Duration",
  key: "Key",
  bpm: "BPM",
  releaseYear: "Release Year",
  added: "Added In Game",
  album: "Album",
  genres: "Genres",
};

const formatLabel = (key: string) => {
  if (LABEL_OVERRIDES[key]) {
    return LABEL_OVERRIDES[key];
  }

  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (c) => c.toUpperCase());
};

const formatValue = (value: unknown): string => {
  if (value === null || value === undefined || value === "") return "—";
  if (Array.isArray(value)) return value.join(", ") || "—";
  return String(value);
};

const isEmpty = (value: unknown): boolean => {
  if (value === null || value === undefined || value === "") return true;
  if (Array.isArray(value) && value.length === 0) return true;
  return false;
};

const formatDuration = (seconds: unknown): string => {
  const total = Math.round(Number(seconds));
  if (!Number.isFinite(total) || total < 0) return "—";
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
};

const formatAddedDate = (value: unknown): string => {
  if (typeof value !== "string") return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

// Three-stop gradient across the semantic status colors (success -> warning -> danger)
// rather than a hardcoded neutral color ramp, so it follows the palette too.
const difficultyColor = (displayValue: number): string => {
  if (displayValue <= 2) return "bg-success";
  if (displayValue <= 4) return "bg-warning";
  return "bg-danger";
};

function DifficultyDots({ value }: { value: number }) {
  const displayValue = value + DIFFICULTY_DISPLAY_OFFSET;
  const filled = Math.max(0, Math.min(DIFFICULTY_MAX, displayValue));
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: DIFFICULTY_MAX }).map((_, i) => (
        <span
          key={i}
          className={`h-3.5 w-3.5 shrink-0 rounded-full ${
            i < filled ? difficultyColor(filled) : "bg-border-muted"
          }`}
        />
      ))}
    </div>
  );
}

function DifficultyBadges({ difficulty }: { difficulty: Record<string, unknown> }) {
  const entries = DIFFICULTY_ORDER.filter(
    (key) => !isEmpty(difficulty[key]) && Number.isFinite(Number(difficulty[key]))
  );

  if (entries.length === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-4">
      {entries.map((key) => {
        const rawValue = Number(difficulty[key]);
        const displayValue = rawValue + DIFFICULTY_DISPLAY_OFFSET;
        return (
          <div key={key} className="flex flex-col gap-1">
            <span className="text-sm font-semibold uppercase tracking-wide text-text-muted">
              {formatLabel(key)}{" "}
              <span className="text-text-muted/70">({displayValue})</span>
            </span>
            <DifficultyDots value={rawValue} />
          </div>
        );
      })}
    </div>
  );
}

export default function TrackPage() {
  const params = useParams<{ slug: string | string[] }>();
  const slug = Array.isArray(params.slug) ? params.slug[0] : params.slug;

  const [rows, setRows] = useState<TrackRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [slug]);

  useEffect(() => {
    async function loadRows() {
      setLoading(true);
      try {
        const res = await fetch("/api/data");
        if (!res.ok) throw new Error(`Failed to load track data: ${res.status}`);
        const data = await res.json();
        setRows(data.rows ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load data");
      } finally {
        setLoading(false);
      }
    }

    loadRows();
  }, []);

  const track = useMemo(() => {
    if (!slug) return null;
    return rows.find((row) => matchesTrackSlug(row, slug)) ?? null;
  }, [rows, slug]);

  const details = useMemo(() => {
    if (!track) return [];

    const entries: [string, unknown][] = [];

    const combinedKey = [track.key ? formatKeyLabel(track.key) : null, track.mode]
      .filter(Boolean)
      .join(" ");
    if (combinedKey) {
      entries.push(["key", combinedKey]);
    }

    Object.entries(track).forEach(([key, value]) => {
      if (HIDDEN_KEYS.has(key)) return;
      if (isEmpty(value)) return;
      entries.push([key, value]);
    });

    return entries.sort(([a], [b]) => {
      const aIndex = DETAIL_ORDER.indexOf(a as (typeof DETAIL_ORDER)[number]);
      const bIndex = DETAIL_ORDER.indexOf(b as (typeof DETAIL_ORDER)[number]);

      // Both exist in the custom order
      if (aIndex !== -1 && bIndex !== -1) {
        return aIndex - bIndex;
      }

      // a exists but b doesn't -> a comes first
      if (aIndex !== -1) return -1;

      // b exists but a doesn't -> b comes first
      if (bIndex !== -1) return 1;

      // Neither exists -> keep alphabetical order
      return a.localeCompare(b);
    });
  }, [track]);

  return (
    <main className="min-h-screen bg-bg px-4 py-8 text-text transition-colors">
      <div className="mx-auto w-full max-w-6xl">
        <div className="mb-6 flex items-center justify-between gap-3">
          <Link
            href="/"
            className="inline-flex items-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-bg-dark transition hover:bg-highlight"
          >
            ← Back to search
          </Link>

          {track ? (
            <Link
              href={`/similarity?track=${getTrackSlug(track)}`}
              className="inline-flex items-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-bg-dark transition hover:bg-highlight"
            >
              Find similar tracks →
            </Link>
          ) : null}
        </div>

        {loading ? (
          <div className="rounded-lg border border-border-muted bg-bg-light p-6 text-center text-text-muted shadow-sm">
            Loading track…
          </div>
        ) : error ? (
          <div className="rounded-lg border border-danger/40 bg-danger/10 p-6 text-sm text-danger">
            Couldn&apos;t load the track: {error}
          </div>
        ) : !track ? (
          <div className="rounded-lg border border-border-muted bg-bg-light p-6 text-center text-text-muted shadow-sm">
            We couldn&apos;t find that track.
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border-muted bg-bg-light shadow-sm">
            <div className="flex flex-col gap-5 p-6 lg:flex-row lg:items-stretch">
              {track.albumArt ? (
                <img
                  src={track.albumArt}
                  alt={track.song || "Album art"}
                  className="h-64 w-64 flex-shrink-0 rounded-lg object-cover shadow-sm ring-1 ring-border-muted/30"
                />
              ) : (
                <div className="flex h-64 w-64 flex-shrink-0 items-center justify-center rounded-lg bg-bg-dark text-2xl font-semibold text-text">
                  ★
                </div>
              )}
              <div className="flex flex-1 flex-col gap-4 lg:flex-row lg:items-stretch lg:justify-between">
                <div className="flex h-64 flex-1 flex-col justify-between gap-3">
                  <div>
                    <h1 className="text-2xl font-semibold text-text">
                      {track.song || "Untitled track"}
                    </h1>
                    <p className="text-text-muted">
                      {track.artist || "Unknown artist"}
                    </p>
                  </div>

                  <AudioPlayer previewUrl={track.previewUrl} />
                </div>

                <div className="flex h-64 items-center lg:border-l lg:border-border-muted lg:pl-6">
                  <DifficultyBadges
                    difficulty={track.difficulty as unknown as Record<string, unknown>}
                  />
                </div>
              </div>
            </div>

            <dl className="grid grid-cols-1 gap-x-6 gap-y-4 border-t border-border-muted p-6 sm:grid-cols-2">
              {details.map(([key, value]) => {
                let displayValue: string;
                if (key === "duration") {
                  displayValue = formatDuration(value);
                } else if (key === "added") {
                  displayValue = formatAddedDate(value);
                } else {
                  displayValue = formatValue(value);
                }

                return (
                  <div key={key}>
                    <dt className="text-xs font-medium uppercase tracking-wide text-text-muted">
                      {formatLabel(key)}
                    </dt>
                    <dd className="mt-1 text-sm text-text">
                      {displayValue}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </div>
        )}
      </div>
    </main>
  );
}