import { NextResponse } from "next/server";
import { fetchTrackData } from "@/lib/fetchTracks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PREVIEW_API = "https://cdn.qstv.on.epicgames.com/";
const MAX_MANIFEST_BYTES = 1024 * 1024;
const MAX_PREVIEW_BYTES = 20 * 1024 * 1024;
const PREVIEW_HOSTS = new Set(["fortnite-vod.akamaized.net"]);

function getPreviewMediaUrl(manifest: string): URL {
  const baseUrls = Array.from(
    manifest.matchAll(/<BaseURL\b[^>]*>([\s\S]*?)<\/BaseURL>/gi),
    (match) => match[1].trim().replaceAll("&amp;", "&")
  );
  const rootUrl = baseUrls.find((value) => /^https:\/\//i.test(value));
  const mediaPath = baseUrls.find((value) => value && !/^https?:\/\//i.test(value));

  if (!rootUrl || !mediaPath) {
    throw new Error("Preview manifest did not contain the expected media URL.");
  }

  const root = new URL(rootUrl);
  if (!PREVIEW_HOSTS.has(root.hostname)) {
    throw new Error("Preview manifest returned an unexpected media host.");
  }

  const mediaUrl = new URL(mediaPath, root.href.endsWith("/") ? root : `${root.href}/`);
  if (mediaUrl.protocol !== "https:" || mediaUrl.origin !== root.origin) {
    throw new Error("Preview manifest returned an invalid media URL.");
  }

  return mediaUrl;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const { rows } = await fetchTrackData();
    const track = rows.find((row) => row.id === id);

    if (!track?.previewId) {
      return NextResponse.json(
        { error: "No preview is available for this track." },
        { status: 404 }
      );
    }

    const previewResponse = await fetch(
      PREVIEW_API + encodeURIComponent(track.previewId),
      { signal: AbortSignal.timeout(20_000), cache: "no-store" }
    );
    if (!previewResponse.ok) {
      throw new Error(`Preview provider returned ${previewResponse.status}.`);
    }

    const payload: unknown = await previewResponse.json();
    if (
      !payload ||
      typeof payload !== "object" ||
      !("playlist" in payload) ||
      typeof payload.playlist !== "string"
    ) {
      throw new Error("Preview provider returned an invalid manifest.");
    }

    const manifest = Buffer.from(payload.playlist, "base64").toString("utf8");
    if (manifest.length === 0 || Buffer.byteLength(manifest) > MAX_MANIFEST_BYTES) {
      throw new Error("Preview provider returned an invalid manifest.");
    }

    const mediaUrl = getPreviewMediaUrl(manifest);
    const mediaResponse = await fetch(mediaUrl, {
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
    });
    if (!mediaResponse.ok || !mediaResponse.body) {
      throw new Error(`Preview media returned ${mediaResponse.status}.`);
    }

    const contentLength = Number(mediaResponse.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > MAX_PREVIEW_BYTES) {
      throw new Error("Preview media exceeded the size limit.");
    }

    return new Response(mediaResponse.body, {
      headers: {
        "Content-Type": "audio/mp4",
        ...(Number.isFinite(contentLength) && contentLength > 0
          ? { "Content-Length": String(contentLength) }
          : {}),
        "Cache-Control": "private, no-store",
        "Content-Disposition": 'inline; filename="track-preview.mp4"',
      },
    });
  } catch (error) {
    console.error("Failed to load track preview:", error);
    return NextResponse.json(
      { error: "Could not load this preview right now." },
      { status: 502 }
    );
  }
}
