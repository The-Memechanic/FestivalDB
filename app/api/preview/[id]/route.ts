import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NextResponse } from "next/server";
import { fetchTrackData } from "@/lib/fetchTracks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PREVIEW_API = "https://cdn.qstv.on.epicgames.com/";
const MAX_PREVIEW_BYTES = 8 * 1024 * 1024;

function convertPreview(manifestPath: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn(
      "ffmpeg",
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        manifestPath,
        "-t",
        "30",
        "-vn",
        "-c:a",
        "libopus",
        "-ar",
        "48000",
        "-f",
        "ogg",
        "pipe:1",
      ],
      { stdio: ["ignore", "pipe", "pipe"] }
    );

    const chunks: Buffer[] = [];
    let byteCount = 0;
    let stderr = "";
    let failure: Error | null = null;
    const timeout = setTimeout(() => {
      failure = new Error("Preview conversion timed out.");
      ffmpeg.kill("SIGKILL");
    }, 45_000);

    ffmpeg.stdout.on("data", (chunk: Buffer) => {
      byteCount += chunk.length;
      if (byteCount > MAX_PREVIEW_BYTES) {
        failure = new Error("Preview output exceeded the size limit.");
        ffmpeg.kill("SIGKILL");
        return;
      }
      chunks.push(chunk);
    });

    ffmpeg.stderr.on("data", (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-4000);
    });

    ffmpeg.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    ffmpeg.on("close", (code) => {
      clearTimeout(timeout);
      if (failure) {
        reject(failure);
      } else if (code !== 0 || chunks.length === 0) {
        reject(new Error(stderr.trim() || "FFmpeg could not decode the preview."));
      } else {
        resolve(Buffer.concat(chunks));
      }
    });
  });
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  let tempDirectory: string | null = null;

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

    const manifest = Buffer.from(payload.playlist, "base64");
    if (manifest.length === 0 || manifest.length > 1024 * 1024) {
      throw new Error("Preview provider returned an invalid manifest.");
    }

    tempDirectory = await mkdtemp(path.join(os.tmpdir(), "festival-preview-"));
    const manifestPath = path.join(tempDirectory, "preview.mpd");
    await writeFile(manifestPath, manifest);
    const audio = await convertPreview(manifestPath);
    const body = new Uint8Array(audio.length);
    body.set(audio);

    return new Response(body, {
      headers: {
        "Content-Type": "audio/ogg",
        "Content-Length": String(audio.length),
        "Cache-Control": "private, no-store",
        "Content-Disposition": 'inline; filename="track-preview.ogg"',
      },
    });
  } catch (error) {
    console.error("Failed to load track preview:", error);
    return NextResponse.json(
      { error: "Could not load this preview right now." },
      { status: 502 }
    );
  } finally {
    if (tempDirectory) {
      await rm(tempDirectory, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}
