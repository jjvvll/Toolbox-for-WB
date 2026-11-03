import type { Metadata } from "next";
import ToolHeader from "@/components/tool-header";
import HeadshotLoader from "./headshot-loader";

export const metadata: Metadata = {
  title: "Headshot Maker",
};

export default function HeadshotPage() {
  return (
    <>
      <ToolHeader title="Headshot Maker">
        Drop in a photo and it finds the face and crops a head-and-shoulders profile picture. Detection runs in your
        browser; the photo is never uploaded.
      </ToolHeader>
      <HeadshotLoader />
    </>
  );
}
