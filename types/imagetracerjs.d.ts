// Minimal typings for imagetracerjs (the package ships none).
declare module "imagetracerjs" {
  export type RGBA = { r: number; g: number; b: number; a: number };
  export type TraceData = {
    layers: { isholepath: boolean }[][];
    palette: RGBA[];
    width: number;
    height: number;
  };
  const ImageTracer: {
    imagedataToTracedata(imgd: ImageData, options?: Record<string, unknown>): TraceData;
    svgpathstring(tracedata: TraceData, lnum: number, pnum: number, options: Record<string, unknown>): string;
    checkoptions(options?: Record<string, unknown>): Record<string, unknown>;
  };
  export default ImageTracer;
}
