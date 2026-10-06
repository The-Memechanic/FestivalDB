"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import Fuse from "fuse.js";
import type { TrackRow } from "@/lib/fetchTracks";
import { getTrackSlug } from "@/lib/trackSlug";
import { getPitchClass, formatKeyLabel } from "@/lib/musicKey";

const SORT_OPTIONS = [
  { value: "relevancy", label: "Relevancy" },
  { value: "releaseYear", label: "Release year" },
  { value: "bpm", label: "BPM" },
  { value: "added", label: "Added" },
] as const;

type SortOption = (typeof SORT_OPTIONS)[number]["value"];

const DIFFICULTY_INSTRUMENTS = [
  { key: "vocals", label: "Vocals" },
  { key: "guitar", label: "Guitar" },
  { key: "bass", label: "Bass" },
  { key: "drums", label: "Drums" },
  { key: "plasticVocals", label: "Pro Vocals" },
  { key: "plasticGuitar", label: "Pro Guitar" },
  { key: "plasticBass", label: "Pro Bass" },
  { key: "plasticDrums", label: "Pro Drums" },
] as const;

type SearchState = {
  query: string;
  genreFilter: string[];
  keyFilter: string[];
  modeFilter: string[];
  difficultyFilters: Record<string, number>;
  bpmMin: number | null;
  bpmMax: number | null;
  durationMin: number | null;
  durationMax: number | null;
  durationBoundsMax: number | null;
  sortOption: SortOption;
  sortDirection: "asc" | "desc";
  page: number;
};

const STORAGE_KEY = "fn-jam-track-search-state-v2";

const getDefaultState = (): SearchState => ({
  query: "",
  genreFilter: [],
  keyFilter: [],
  modeFilter: [],
  difficultyFilters: {},
  bpmMin: null,
  bpmMax: null,
  durationMin: null,
  durationMax: null,
  durationBoundsMax: null,
  sortOption: "added",
  sortDirection: "desc",
  page: 1,
});

const readStoredState = (): SearchState => {
  if (typeof window === "undefined") return getDefaultState();

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return getDefaultState();

    const parsed = JSON.parse(raw) as Partial<SearchState>;
    const defaultState = getDefaultState();
    const hasStoredDurationBounds = typeof parsed.durationBoundsMax === "number";

    return {
      query: typeof parsed.query === "string" ? parsed.query : defaultState.query,
      genreFilter: Array.isArray(parsed.genreFilter) ? parsed.genreFilter : defaultState.genreFilter,
      keyFilter: Array.isArray(parsed.keyFilter) ? parsed.keyFilter : defaultState.keyFilter,
      modeFilter: Array.isArray(parsed.modeFilter) ? parsed.modeFilter : defaultState.modeFilter,
      difficultyFilters:
        parsed.difficultyFilters && typeof parsed.difficultyFilters === "object"
          ? parsed.difficultyFilters
          : defaultState.difficultyFilters,
      bpmMin: typeof parsed.bpmMin === "number" ? parsed.bpmMin : defaultState.bpmMin,
      bpmMax: typeof parsed.bpmMax === "number" ? parsed.bpmMax : defaultState.bpmMax,
      // Older saved states don't record the dataset maximum, so treat their
      // duration range as a default and initialize it from the current data.
      durationMin:
        hasStoredDurationBounds && typeof parsed.durationMin === "number"
          ? parsed.durationMin
          : defaultState.durationMin,
      durationMax:
        hasStoredDurationBounds && typeof parsed.durationMax === "number"
          ? parsed.durationMax
          : defaultState.durationMax,
      durationBoundsMax: hasStoredDurationBounds ? parsed.durationBoundsMax! : defaultState.durationBoundsMax,
      sortOption: SORT_OPTIONS.some((option) => option.value === parsed.sortOption)
        ? (parsed.sortOption as SortOption)
        : defaultState.sortOption,
      sortDirection: parsed.sortDirection === "asc" ? "asc" : defaultState.sortDirection,
      page: typeof parsed.page === "number" && parsed.page > 0 ? parsed.page : defaultState.page,
    };
  } catch {
    return getDefaultState();
  }
};

const writeStoredState = (state: SearchState) => {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage failures so the UI still works.
  }
};

const compareString = (a: string, b: string) =>
  a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });

const parseNumber = (value?: number | null) => (typeof value === "number" ? value : NaN);

const formatDuration = (seconds: number): string => {
  const total = Math.round(seconds);
  if (!Number.isFinite(total) || total < 0) return "—";
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
};

const compareRows = (a: TrackRow, b: TrackRow, sortOption: SortOption) => {
  switch (sortOption) {
    case "releaseYear": {
      const na = parseNumber(a.releaseYear);
      const nb = parseNumber(b.releaseYear);
      if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
      if (!Number.isNaN(na)) return -1;
      if (!Number.isNaN(nb)) return 1;
      return compareString(a.song, b.song);
    }
    case "bpm": {
      const na = parseNumber(a.bpm);
      const nb = parseNumber(b.bpm);
      if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
      if (!Number.isNaN(na)) return -1;
      if (!Number.isNaN(nb)) return 1;
      return compareString(a.song, b.song);
    }
    default:
      return 0;
  }
};

const equalsNormalized = (value: string, option: string) =>
  value.trim().toLowerCase() === option.trim().toLowerCase();

const toggleValue = (list: string[], value: string) =>
  list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

export default function SearchClient() {
  const initialState = useMemo(() => readStoredState(), []);
  const [query, setQuery] = useState(initialState.query);
  const [genreFilter, setGenreFilter] = useState<string[]>(initialState.genreFilter);
  const [keyFilter, setKeyFilter] = useState<string[]>(initialState.keyFilter);
  const [modeFilter, setModeFilter] = useState<string[]>(initialState.modeFilter);
  const [difficultyFilters, setDifficultyFilters] = useState<Record<string, number>>(
    initialState.difficultyFilters
  );
  const [bpmRange, setBpmRange] = useState<[number, number] | null>(
    initialState.bpmMin !== null && initialState.bpmMax !== null
      ? [initialState.bpmMin, initialState.bpmMax]
      : null
  );
  const [durationRange, setDurationRange] = useState<[number, number] | null>(
    initialState.durationMin !== null && initialState.durationMax !== null
      ? [initialState.durationMin, initialState.durationMax]
      : null
  );
  const [sortOption, setSortOption] = useState<SortOption>(initialState.sortOption);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">(initialState.sortDirection);
  const [page, setPage] = useState(initialState.page);
  const [rows, setRows] = useState<TrackRow[]>([]);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasHydratedRef = useRef(false);
  const hasInitializedRangesRef = useRef(false);
  const PAGE_SIZE = 20;

  useEffect(() => {
    async function loadRows() {
      setLoading(true);
      try {
        const res = await fetch("/api/data");
        if (!res.ok) {
          throw new Error(`Failed to load track data: ${res.status}`);
        }

        const data = await res.json();
        setRows(data.rows ?? []);
        setFetchedAt(data._metadata?.lastUpdated ?? null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load data");
      } finally {
        setLoading(false);
      }
    }

    loadRows();
  }, []);

  const bpmBounds = useMemo(() => {
    const values = rows
      .map((r) => r.bpm)
      .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    if (values.length === 0) return { min: 0, max: 200 };
    return { min: Math.floor(Math.min(...values)), max: Math.ceil(Math.max(...values)) };
  }, [rows]);

  const durationBounds = useMemo(() => {
    const values = rows
      .map((r) => r.duration)
      .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    if (values.length === 0) return { min: 0, max: 600 };
    return { min: Math.floor(Math.min(...values)), max: Math.ceil(Math.max(...values)) };
  }, [rows]);

  const keyOptions = useMemo(() => {
    const map = new Map<number, string>();
    rows.forEach((r) => {
      const pitchClass = getPitchClass(r.key);
      if (pitchClass !== null && !map.has(pitchClass)) {
        map.set(pitchClass, formatKeyLabel(r.key));
      }
    });
    return Array.from(map.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([pitchClass, label]) => ({ value: String(pitchClass), label }));
  }, [rows]);

  const modeOptions = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => {
      if (r.mode) set.add(r.mode);
    });
    return Array.from(set).sort(compareString);
  }, [rows]);

  // Initialize the range sliders to the full bounds once data has loaded,
  // clamping any restored values so they stay within the current dataset.
  useEffect(() => {
    if (loading || hasInitializedRangesRef.current) return;
    hasInitializedRangesRef.current = true;

    setBpmRange((current) => {
      if (!current) return [bpmBounds.min, bpmBounds.max];
      return [
        Math.max(bpmBounds.min, Math.min(current[0], bpmBounds.max)),
        Math.max(bpmBounds.min, Math.min(current[1], bpmBounds.max)),
      ];
    });

    setDurationRange((current) => {
      if (!current) return [durationBounds.min, durationBounds.max];
      const wasAtPreviousMaximum =
        initialState.durationBoundsMax !== null && initialState.durationMax === initialState.durationBoundsMax;
      return [
        Math.max(durationBounds.min, Math.min(current[0], durationBounds.max)),
        wasAtPreviousMaximum
          ? durationBounds.max
          : Math.max(durationBounds.min, Math.min(current[1], durationBounds.max)),
      ];
    });
  }, [loading, bpmBounds, durationBounds, initialState.durationBoundsMax, initialState.durationMax]);

  const isBpmNarrowed =
    bpmRange !== null && (bpmRange[0] > bpmBounds.min || bpmRange[1] < bpmBounds.max);
  const isDurationNarrowed =
    durationRange !== null &&
    (durationRange[0] > durationBounds.min || durationRange[1] < durationBounds.max);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (
        genreFilter.length > 0 &&
        !genreFilter.some((filterValue) => row.genres.some((genre) => equalsNormalized(genre, filterValue)))
      ) {
        return false;
      }

      if (keyFilter.length > 0) {
        const rowPitchClass = getPitchClass(row.key);
        if (rowPitchClass === null || !keyFilter.includes(String(rowPitchClass))) return false;
      }

      if (modeFilter.length > 0 && !(row.mode && modeFilter.some((f) => equalsNormalized(row.mode as string, f)))) {
        return false;
      }

      const difficulty = row.difficulty as Record<string, number> | undefined;
      for (const instrument of DIFFICULTY_INSTRUMENTS) {
        const minLevel = difficultyFilters[instrument.key];
        if (minLevel && minLevel > 0) {
          const raw = difficulty?.[instrument.key];
          if (typeof raw !== "number" || raw === 99) return false;
          if (raw + 1 < minLevel) return false;
        }
      }

      if (bpmRange && isBpmNarrowed) {
        if (typeof row.bpm !== "number") return false;
        if (row.bpm < bpmRange[0] || row.bpm > bpmRange[1]) return false;
      }

      if (durationRange && isDurationNarrowed) {
        if (typeof row.duration !== "number") return false;
        if (row.duration < durationRange[0] || row.duration > durationRange[1]) return false;
      }

      return true;
    });
  }, [genreFilter, keyFilter, modeFilter, difficultyFilters, bpmRange, durationRange, isBpmNarrowed, isDurationNarrowed, rows]);

  const fuse = useMemo(() => {
    return new Fuse(filteredRows, {
      keys: ["song", "artist"],
      threshold: 0.15,
    });
  }, [filteredRows]);

  const searchedRows = useMemo(() => {
    if (!query.trim()) return filteredRows;
    return fuse.search(query).map((r) => r.item);
  }, [query, fuse, filteredRows]);

  const results = useMemo(() => {
    if (sortOption === "relevancy") return searchedRows;

    if (sortOption === "added") {
      const databaseOrder = new Map(rows.map((row, index) => [row.id, index] as const));
      const sorted = [...searchedRows].sort(
        (a, b) => (databaseOrder.get(a.id) ?? 0) - (databaseOrder.get(b.id) ?? 0)
      );
      return sortDirection === "desc" ? sorted.reverse() : sorted;
    }

    const sorted = [...searchedRows].sort((a, b) => {
      const comparison = compareRows(a, b, sortOption);
      return sortDirection === "asc" ? comparison : -comparison;
    });
    return sorted;
  }, [rows, searchedRows, sortOption, sortDirection]);

  const totalPages = Math.max(1, Math.ceil(results.length / PAGE_SIZE));
  const paginatedResults = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return results.slice(start, start + PAGE_SIZE);
  }, [page, results]);

  useEffect(() => {
    if (!hasHydratedRef.current) {
      hasHydratedRef.current = true;
      return;
    }

    writeStoredState({
      query,
      genreFilter,
      keyFilter,
      modeFilter,
      difficultyFilters,
      bpmMin: bpmRange ? bpmRange[0] : null,
      bpmMax: bpmRange ? bpmRange[1] : null,
      durationMin: durationRange ? durationRange[0] : null,
      durationMax: durationRange ? durationRange[1] : null,
      durationBoundsMax: durationBounds.max,
      sortOption,
      sortDirection,
      page,
    });
  }, [query, genreFilter, keyFilter, modeFilter, difficultyFilters, bpmRange, durationRange, durationBounds.max, sortOption, sortDirection, page]);

  useEffect(() => {
    if (!hasHydratedRef.current) {
      hasHydratedRef.current = true;
      return;
    }

    setPage(1);
  }, [query, genreFilter, keyFilter, modeFilter, difficultyFilters, bpmRange, durationRange, sortOption, sortDirection]);

  const resetFilters = () => {
    setGenreFilter([]);
    setKeyFilter([]);
    setModeFilter([]);
    setDifficultyFilters({});
    setBpmRange([bpmBounds.min, bpmBounds.max]);
    setDurationRange([durationBounds.min, durationBounds.max]);
  };

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-4xl rounded-lg border border-border-muted bg-bg-light p-6 text-center text-text-muted shadow-sm">
        Loading Fortnite track data…
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto w-full max-w-4xl rounded-lg border border-danger/40 bg-danger/10 p-6 text-sm text-danger">
        Couldn&apos;t load the tracks: {error}
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <aside className="rounded-lg border border-border-muted bg-bg-light p-5 shadow-sm">
          <div className="flex flex-col gap-6">
            <div>
              <label className="mb-2 block text-sm font-medium text-text-muted">Search</label>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by song or artist…"
                className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-text">Filters</h3>
              <button
                type="button"
                onClick={resetFilters}
                className="text-xs font-medium text-text-muted underline-offset-2 hover:underline"
              >
                Reset filters
              </button>
            </div>

            {keyOptions.length > 0 ? (
              <div>
                <p className="mb-2 text-sm font-medium text-text-muted">Key</p>
                <div className="grid grid-cols-4 grid-rows-3 gap-2">
                  {keyOptions.map((option) => {
                    const active = keyFilter.includes(option.value);
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setKeyFilter((current) => toggleValue(current, option.value))}
                        className={`rounded-full border px-2.5 py-1 text-center text-xs font-medium transition ${
                          active
                            ? "border-primary bg-primary text-bg-dark"
                            : "border-border bg-bg text-text-muted hover:bg-bg-dark"
                        }`}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {modeOptions.length > 0 ? (
              <div>
                <p className="mb-2 text-sm font-medium text-text-muted">Mode</p>
                <div className="flex flex-wrap gap-2">
                  {modeOptions.map((option) => {
                    const active = modeFilter.some((f) => equalsNormalized(f, option));
                    return (
                      <button
                        key={option}
                        type="button"
                        onClick={() => setModeFilter((current) => toggleValue(current, option))}
                        className={`rounded-full border px-2.5 py-1 text-xs font-medium capitalize transition ${
                          active
                            ? "border-primary bg-primary text-bg-dark"
                            : "border-border bg-bg text-text-muted hover:bg-bg-dark"
                        }`}
                      >
                        {option}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            <div>
              <p className="mb-2 text-sm font-medium text-text-muted">Difficulties (minimum)</p>
              <div className="space-y-2">
                {DIFFICULTY_INSTRUMENTS.map((instrument) => (
                  <div key={instrument.key} className="flex items-center justify-between gap-2">
                    <label htmlFor={`difficulty-${instrument.key}`} className="text-xs text-text-muted">
                      {instrument.label}
                    </label>
                    <select
                      id={`difficulty-${instrument.key}`}
                      value={difficultyFilters[instrument.key] ?? 0}
                      onChange={(e) =>
                        setDifficultyFilters((current) => ({
                          ...current,
                          [instrument.key]: Number(e.target.value),
                        }))
                      }
                      className="rounded-lg border border-border bg-bg px-2 py-1 text-xs text-text focus:outline-none focus:ring-2 focus:ring-primary"
                    >
                      <option value={0}>Any</option>
                      {[1, 2, 3, 4, 5, 6, 7].map((level) => (
                        <option key={level} value={level}>
                          {level === 7 ? level : `${level}+`}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between text-sm font-medium text-text-muted">
                <span>BPM</span>
                <span className="text-text-muted">
                  {bpmRange ? `${bpmRange[0]}–${bpmRange[1]}` : "—"}
                </span>
              </div>
              <div className="space-y-2">
                <input
                  type="range"
                  min={bpmBounds.min}
                  max={bpmBounds.max}
                  value={bpmRange ? bpmRange[0] : bpmBounds.min}
                  onChange={(e) => {
                    const next = Number(e.target.value);
                    setBpmRange((current) => {
                      const upper = current ? current[1] : bpmBounds.max;
                      return [Math.min(next, upper), upper];
                    });
                  }}
                  className="w-full accent-primary"
                  aria-label="Minimum BPM"
                />
                <input
                  type="range"
                  min={bpmBounds.min}
                  max={bpmBounds.max}
                  value={bpmRange ? bpmRange[1] : bpmBounds.max}
                  onChange={(e) => {
                    const next = Number(e.target.value);
                    setBpmRange((current) => {
                      const lower = current ? current[0] : bpmBounds.min;
                      return [lower, Math.max(next, lower)];
                    });
                  }}
                  className="w-full accent-primary"
                  aria-label="Maximum BPM"
                />
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between text-sm font-medium text-text-muted">
                <span>Duration</span>
                <span className="text-text-muted">
                  {durationRange
                    ? `${formatDuration(durationRange[0])}–${formatDuration(durationRange[1])}`
                    : "—"}
                </span>
              </div>
              <div className="space-y-2">
                <input
                  type="range"
                  min={durationBounds.min}
                  max={durationBounds.max}
                  value={durationRange ? durationRange[0] : durationBounds.min}
                  onChange={(e) => {
                    const next = Number(e.target.value);
                    setDurationRange((current) => {
                      const upper = current ? current[1] : durationBounds.max;
                      return [Math.min(next, upper), upper];
                    });
                  }}
                  className="w-full accent-primary"
                  aria-label="Minimum duration"
                />
                <input
                  type="range"
                  min={durationBounds.min}
                  max={durationBounds.max}
                  value={durationRange ? durationRange[1] : durationBounds.max}
                  onChange={(e) => {
                    const next = Number(e.target.value);
                    setDurationRange((current) => {
                      const lower = current ? current[0] : durationBounds.min;
                      return [lower, Math.max(next, lower)];
                    });
                  }}
                  className="w-full accent-primary"
                  aria-label="Maximum duration"
                />
              </div>
            </div>
          </div>
        </aside>

        <section className="space-y-6">
          <div className="flex flex-col gap-3 rounded-lg border border-border-muted bg-bg-light p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <span className="font-medium text-text-muted">Sort:</span>
              <select
                value={sortOption}
                onChange={(e) => setSortOption(e.target.value as SortOption)}
                className="rounded-lg border border-border bg-bg px-2 py-1 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary"
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              {sortOption !== "relevancy" ? (
                <button
                  type="button"
                  onClick={() => setSortDirection((current) => (current === "asc" ? "desc" : "asc"))}
                  className="inline-flex items-center gap-2 rounded-lg border border-border bg-bg px-3 py-1 text-sm text-text-muted hover:bg-bg-dark focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  {sortDirection === "asc" ? "Ascending" : "Descending"}
                </button>
              ) : null}
            </div>
            <div className="flex flex-col gap-2 text-sm text-text-muted sm:flex-row sm:items-center">
              <span>
                {results.length} of {filteredRows.length} track{filteredRows.length === 1 ? "" : "s"}
              </span>
              <span>Data last updated at {fetchedAt ? new Date(fetchedAt).toLocaleString() : "unknown"}</span>
            </div>
          </div>

          {totalPages > 1 ? (
            <div className="mt-4 flex flex-col items-center justify-between gap-3 rounded-lg border border-border-muted bg-bg-light p-4 text-sm text-text-muted shadow-sm sm:flex-row">
              <p>
                Page {page} of {totalPages}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={page === 1}
                  className="rounded-lg border border-border bg-primary px-3 py-2 text-sm text-bg-dark disabled:cursor-not-allowed disabled:opacity-40 hover:bg-highlight focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  Go Back
                </button>
                <button
                  type="button"
                  onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                  disabled={page === totalPages}
                  className="rounded-lg border border-border bg-primary px-3 py-2 text-sm text-bg-dark disabled:cursor-not-allowed disabled:opacity-40 hover:bg-highlight focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  Keep Going
                </button>
              </div>
            </div>
          ) : null}

          {results.length === 0 ? (
            <div className="rounded-lg border border-border-muted bg-bg-light p-6 text-center text-text-muted shadow-sm">
              No matches. Try a different search term.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {paginatedResults.map((row, i) => (
                  <Link
                    key={(page - 1) * PAGE_SIZE + i}
                    href={`/track/${getTrackSlug(row)}`}
                    className="group flex flex-col gap-2 rounded-lg border border-border-muted bg-bg-light p-3 transition-colors hover:border-primary"
                  >
                    <div className="aspect-square w-full overflow-hidden rounded-md bg-bg-dark">
                      {row.albumArt ? (
                        <img
                          src={row.albumArt}
                          alt={row.song || "Album art"}
                          loading="lazy"
                          className="h-full w-full object-cover transition-transform group-hover:scale-110"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-xs text-text-muted">
                          No image
                        </div>
                      )}
                    </div>
                    <div>
                      <p className="truncate text-sm font-semibold text-text">
                        {row.song || "Untitled track"}
                      </p>
                      <p className="truncate text-xs text-text-muted">
                        {row.artist || "Unknown artist"}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>

              {totalPages > 1 ? (
                <div className="mt-4 flex flex-col items-center justify-between gap-3 rounded-lg border border-border-muted bg-bg-light p-4 text-sm text-text-muted shadow-sm sm:flex-row">
                  <p>
                    Page {page} of {totalPages}
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setPage((current) => Math.max(1, current - 1))}
                      disabled={page === 1}
                      className="rounded-lg border border-border bg-primary px-3 py-2 text-sm text-bg-dark disabled:cursor-not-allowed disabled:opacity-40 hover:bg-highlight focus:outline-none focus:ring-2 focus:ring-primary"
                    >
                      Go Back
                    </button>
                    <button
                      type="button"
                      onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                      disabled={page === totalPages}
                      className="rounded-lg border border-border bg-primary px-3 py-2 text-sm text-bg-dark disabled:cursor-not-allowed disabled:opacity-40 hover:bg-highlight focus:outline-none focus:ring-2 focus:ring-primary"
                    >
                      Keep Going
                    </button>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </section>
      </div>
    </div>
  );
}