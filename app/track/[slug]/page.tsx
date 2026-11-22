"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useRef } from "react";
import { useParams } from "next/navigation";
import type { TrackRow } from "@/lib/fetchTracks";
import { getTrackSlug, matchesTrackSlug } from "@/lib/trackSlug";
import { AudioPlayer } from "@/components/AudioPlayer";
import { formatKeyLabel } from "@/lib/musicKey";

const DETAIL_KEYS = new Set([
  "duration",
  "bpm",
  "releaseYear",
  "lastModified",
  "activeDate",
  "newUntilDate",
  "album",
  "esrbRating",
]);

const DETAIL_ORDER = [
  "duration",
  "key",
  "bpm",
  "releaseYear",
  "lastModified",
  "activeDate",
  "newUntilDate",
  "album",
  "genres",
  "esrbRating",
] as const;

const DIFFICULTY_ORDER = [
  "vocals",
  "plasticVocals",
  "guitar",
  "plasticGuitar",
  "bass",
  "plasticBass",
  "drums",
  "plasticDrums",
] as const;

const DIFFICULTY_MAX = 7;
const DIFFICULTY_DISPLAY_OFFSET = 1; // raw API 0–6 -> displayed 1–7
const UNSUPPORTED_DIFFICULTY = 99;
const PIP_COLOR_PREFERENCE_KEY = "festivaldb-individual-difficulty-pip-colors";
const DIFFICULTY_PIP_COLORS = [
  "bg-emerald-500",
  "bg-lime-500",
  "bg-yellow-400",
  "bg-amber-500",
  "bg-orange-500",
  "bg-rose-500",
  "bg-red-600",
];

const LABEL_OVERRIDES: Record<string, string> = {
  plasticVocals: "Pro Vocals",
  plasticGuitar: "Pro Guitar",
  plasticBass: "Pro Bass",
  plasticDrums: "Pro Drums",
  duration: "Duration",
  key: "Key",
  bpm: "BPM",
  releaseYear: "Release Year",
  lastModified: "Last Modified",
  activeDate: "Active Date",
  newUntilDate: "New Until",
  album: "Album",
  genres: "Genres",
  esrbRating: "ESRB Rating",
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

const formatDate = (value: unknown): string => {
  if (typeof value !== "string") return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

function DifficultyDots({
  value,
  individualColors,
}: {
  value: number;
  individualColors: boolean;
}) {
  const displayValue = value + DIFFICULTY_DISPLAY_OFFSET;
  const filled =
    value === UNSUPPORTED_DIFFICULTY
      ? 0
      : Math.max(0, Math.min(DIFFICULTY_MAX, displayValue));
  const difficultyColor = DIFFICULTY_PIP_COLORS[filled - 1];
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: DIFFICULTY_MAX }).map((_, i) => (
        <span
          key={i}
          className={`h-3.5 w-3.5 shrink-0 rounded-full ${
            i < filled
              ? individualColors
                ? DIFFICULTY_PIP_COLORS[i]
                : difficultyColor
              : "bg-border-muted"
          }`}
        />
      ))}
    </div>
  );
}

function DifficultyBadges({
  difficulty,
  individualColors,
  onIndividualColorsChange,
}: {
  difficulty: Record<string, unknown>;
  individualColors: boolean;
  onIndividualColorsChange: (value: boolean) => void;
}) {
  const entries = DIFFICULTY_ORDER.filter(
    (key) => !isEmpty(difficulty[key]) && Number.isFinite(Number(difficulty[key]))
  );

  if (entries.length === 0) return null;

  return (
    <div className="flex w-full flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold text-text-muted">
          Main Stage Difficulties
        </span>
        <button
          type="button"
          aria-pressed={individualColors}
          onClick={() => onIndividualColorsChange(!individualColors)}
          className="rounded-md border border-border bg-bg px-2 py-1 text-xs text-text-muted transition hover:bg-bg-dark"
        >
          {individualColors ? "Color by Difficulty" : "Individual Colors"}
        </button>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-4 lg:grid-cols-4">
        {entries.map((key) => {
          const rawValue = Number(difficulty[key]);
          const displayValue = rawValue + DIFFICULTY_DISPLAY_OFFSET;
          const unsupported = rawValue === UNSUPPORTED_DIFFICULTY;
          return (
            <div key={key} className="flex flex-col gap-1">
              <span className="text-sm font-semibold uppercase tracking-wide text-text-muted">
                {formatLabel(key)}{" "}
                <span className="text-text-muted/70">
                  {unsupported ? "(N/A)" : `(${displayValue})`}
                </span>
              </span>
              <DifficultyDots value={rawValue} individualColors={individualColors} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function TrackPage() {
  const params = useParams<{ slug: string | string[] }>();
  const slug = Array.isArray(params.slug) ? params.slug[0] : params.slug;

  const [rows, setRows] = useState<TrackRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [individualPipColors, setIndividualPipColors] = useState(false);

  useEffect(() => {
    try {
      setIndividualPipColors(
        window.localStorage.getItem(PIP_COLOR_PREFERENCE_KEY) === "true"
      );
    } catch {
      // Keep the default color mode when browser storage is unavailable.
    }
  }, []);

  const updatePipColorPreference = (individual: boolean) => {
    setIndividualPipColors(individual);
    try {
      window.localStorage.setItem(PIP_COLOR_PREFERENCE_KEY, String(individual));
    } catch {
      // The preference still applies for this page even if it cannot be saved.
    }
  };

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
      if (!DETAIL_KEYS.has(key)) return;
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
            <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(12rem,0.28fr)]">
              <section className="flex flex-col gap-5 p-6">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-stretch">
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
                  <div className="flex h-64 min-w-0 flex-1 flex-col justify-between gap-3">
                    <div>
                      <h1 className="text-2xl font-semibold text-text">
                        {track.song || "Untitled track"}
                      </h1>
                      <p className="text-text-muted">
                        {track.artist || "Unknown artist"}
                      </p>
                    </div>

                    <AudioPlayer trackId={track.id} hasPreview={Boolean(track.previewId)} />
                  </div>
                </div>

                <div className="flex w-full items-center">
                  <DifficultyBadges
                    difficulty={track.difficulty as unknown as Record<string, unknown>}
                    individualColors={individualPipColors}
                    onIndividualColorsChange={updatePipColorPreference}
                  />
                </div>
              </section>

              <dl className="grid min-w-0 grid-cols-2 gap-x-6 gap-y-4 border-t border-border-muted p-6 text-left lg:grid-cols-1 lg:border-l lg:border-t-0">
                {details.map(([key, value]) => {
                  let displayValue: string;
                  if (key === "duration") {
                    displayValue = formatDuration(value);
                  } else if (["lastModified", "activeDate", "newUntilDate"].includes(key)) {
                    displayValue = formatDate(value);
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
          </div>
        )}
      </div>
    </main>
  );
}