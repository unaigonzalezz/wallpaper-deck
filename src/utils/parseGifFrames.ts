import { GifReader } from "omggif";

export interface RawGifFrame {
  pixels: Buffer;
  width: number;
  height: number;
  delay: number; // milliseconds
}

export function parseGifFrames(gifBuffer: Buffer): RawGifFrame[] | null {
  try {
    const reader = new GifReader(new Uint8Array(gifBuffer));
    const numFrames = reader.numFrames();
    if (numFrames <= 1) return null;

    const { width, height } = reader;
    const frames: RawGifFrame[] = [];
    let canvas = new Uint8Array(width * height * 4);

    for (let i = 0; i < numFrames; i++) {
      const info = reader.frameInfo(i);
      const current = new Uint8Array(canvas);
      reader.decodeAndBlitFrameRGBA(i, current);

      frames.push({
        pixels: Buffer.from(current),
        width,
        height,
        delay: Math.max((info.delay || 10) * 10, 50),
      });

      if (info.disposal === 2) {
        // Restore to background: clear the frame area to transparent
        canvas = new Uint8Array(canvas);
        const clearEnd = Math.min(info.y + info.height, height);
        const clearRight = Math.min(info.x + info.width, width);
        for (let y = info.y; y < clearEnd; y++) {
          canvas.fill(0, (y * width + info.x) * 4, (y * width + clearRight) * 4);
        }
      } else {
        canvas = current;
      }
    }

    return frames;
  } catch {
    return null;
  }
}
