import type { Metadata } from "next";
import ToolHeader from "@/components/tool-header";
import VideoCompressorLoader from "./video-compressor-loader";

export const metadata: Metadata = {
  title: "Video Compressor",
};

export default function VideoCompressorPage() {
  return (
    <>
      <ToolHeader title="Video compressor">
        Shrink videos to H.264/AAC MP4 on your own computer. Compressed copies are saved next to the originals,
        which are never changed.
      </ToolHeader>
      <VideoCompressorLoader />
    </>
  );
}
