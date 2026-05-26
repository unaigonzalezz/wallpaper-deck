declare module "omggif" {
  interface FrameInfo {
    x: number;
    y: number;
    width: number;
    height: number;
    delay: number;
    disposal: number;
    transparent_index: number | null;
    interlaced: boolean;
  }

  class GifReader {
    readonly width: number;
    readonly height: number;
    constructor(buf: Uint8Array);
    numFrames(): number;
    frameInfo(frameNum: number): FrameInfo;
    decodeAndBlitFrameRGBA(frameNum: number, pixels: Uint8Array): void;
  }
}
