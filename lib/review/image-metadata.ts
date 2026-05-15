import { createHash, randomUUID } from "node:crypto";

import type { ReviewInputFile, ReviewedFile } from "@/lib/review/schema";

type PreparedFile = {
  buffer: Buffer;
  openaiFile: File;
} & ReviewInputFile;

export type PreparedReviewedFile = PreparedFile & {
  reviewedFile: ReviewedFile;
};

export async function prepareReviewFile(
  inputFile: ReviewInputFile,
  reviewedAt = new Date().toISOString(),
): Promise<PreparedReviewedFile> {
  const arrayBuffer = await inputFile.file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const sha256 = createHash("sha256").update(buffer).digest("hex");
  const resolution = getImageResolution(buffer, inputFile.file.type);
  const notes = [
    `Content type: ${inputFile.file.type || "application/octet-stream"}`,
    `Size: ${inputFile.file.size} bytes`,
  ];

  if (resolution) {
    notes.push(`Image resolution: ${resolution}`);
  }

  return {
    ...inputFile,
    buffer,
    openaiFile: new File([buffer], inputFile.file.name, {
      type: inputFile.file.type || "application/octet-stream",
    }),
    reviewedFile: {
      file_id: `pending_${randomUUID()}`,
      file_name: inputFile.file.name,
      file_path: inputFile.filePath ?? null,
      role: inputFile.role,
      hash: {
        algorithm: "sha256",
        value: sha256,
        provided: true,
      },
      timestamps: {
        created_at: inputFile.createdAt ?? null,
        updated_at: inputFile.updatedAt ?? null,
        reviewed_at: reviewedAt,
      },
      notes,
    },
  };
}

function getImageResolution(buffer: Buffer, contentType: string) {
  return (
    parsePngResolution(buffer, contentType) ||
    parseGifResolution(buffer, contentType) ||
    parseJpegResolution(buffer, contentType) ||
    parseWebpResolution(buffer, contentType) ||
    null
  );
}

function parsePngResolution(buffer: Buffer, contentType: string) {
  if (!contentType.includes("png")) {
    return null;
  }

  const signature = "89504e470d0a1a0a";

  if (buffer.length < 24 || buffer.subarray(0, 8).toString("hex") !== signature) {
    return null;
  }

  return `${buffer.readUInt32BE(16)}x${buffer.readUInt32BE(20)}`;
}

function parseGifResolution(buffer: Buffer, contentType: string) {
  if (!contentType.includes("gif")) {
    return null;
  }

  const header = buffer.subarray(0, 6).toString("ascii");

  if (buffer.length < 10 || (header !== "GIF87a" && header !== "GIF89a")) {
    return null;
  }

  return `${buffer.readUInt16LE(6)}x${buffer.readUInt16LE(8)}`;
}

function parseJpegResolution(buffer: Buffer, contentType: string) {
  if (!contentType.includes("jpeg") && !contentType.includes("jpg")) {
    return null;
  }

  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    return null;
  }

  let offset = 2;

  while (offset < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    const marker = buffer[offset + 1];

    if (marker === 0xd9 || marker === 0xda) {
      break;
    }

    const segmentLength = buffer.readUInt16BE(offset + 2);

    if (
      marker >= 0xc0 &&
      marker <= 0xcf &&
      ![0xc4, 0xc8, 0xcc].includes(marker) &&
      offset + 9 < buffer.length
    ) {
      const height = buffer.readUInt16BE(offset + 5);
      const width = buffer.readUInt16BE(offset + 7);
      return `${width}x${height}`;
    }

    offset += 2 + segmentLength;
  }

  return null;
}

function parseWebpResolution(buffer: Buffer, contentType: string) {
  if (!contentType.includes("webp")) {
    return null;
  }

  if (
    buffer.length < 30 ||
    buffer.subarray(0, 4).toString("ascii") !== "RIFF" ||
    buffer.subarray(8, 12).toString("ascii") !== "WEBP"
  ) {
    return null;
  }

  const chunkType = buffer.subarray(12, 16).toString("ascii");

  if (chunkType === "VP8X") {
    const width = 1 + buffer.readUIntLE(24, 3);
    const height = 1 + buffer.readUIntLE(27, 3);
    return `${width}x${height}`;
  }

  if (chunkType === "VP8 " && buffer.length >= 30) {
    const width = buffer.readUInt16LE(26) & 0x3fff;
    const height = buffer.readUInt16LE(28) & 0x3fff;
    return `${width}x${height}`;
  }

  if (chunkType === "VP8L" && buffer.length >= 25) {
    const bits = buffer.readUInt32LE(21);
    const width = (bits & 0x3fff) + 1;
    const height = ((bits >> 14) & 0x3fff) + 1;
    return `${width}x${height}`;
  }

  return null;
}
