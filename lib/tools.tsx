import type { ReactNode } from "react";

export type Tool = {
  name: string;
  description: string;
  href: string;
  icon: ReactNode;
  /** A short Japanese label shown under the name (manga style). */
  jp: string;
  /** Where the tool is listed in the side rails: website work on the left, media on the right. */
  group: ToolGroup;
};

export type ToolGroup = "site" | "media";
export const TOOL_GROUPS: { id: ToolGroup; label: string; jp: string }[] = [
  { id: "site", label: "Websites & writing", jp: "ウェブ・文章" },
  { id: "media", label: "Images & video", jp: "画像・動画" },
];

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-6 w-6"
      aria-hidden
    >
      {children}
    </svg>
  );
}

// Add a tool here and it shows up on the dashboard.
export const TOOLS: Tool[] = [
  {
    name: "PDF Cover",
    group: "media",
    description: "Render page 1 of one or more PDFs to downloadable images.",
    href: "/pdf-cover",
    jp: "PDF表紙",
    icon: (
      <Icon>
        <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
        <path d="M14 3v5h5" />
        <path d="m8 17 2.5-3 2 2 1.5-2 2 3" />
      </Icon>
    ),
  },
  {
    name: "Folder Thumbnails",
    group: "media",
    description: "Cover images for every video and PDF in a folder, made on your device.",
    href: "/folder-thumbnails",
    jp: "一括サムネ",
    icon: (
      <Icon>
        <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <path d="m10 11 4 2.5-4 2.5z" />
      </Icon>
    ),
  },
  {
    name: "Color Palette",
    group: "site",
    description: "Pick colors from a screenshot and try them on dark, light, and color-block layouts.",
    href: "/color-palette",
    jp: "配色",
    icon: (
      <Icon>
        <path d="M12 3a9 9 0 1 0 0 18c1.2 0 2-.8 2-1.9 0-.5-.2-.9-.5-1.3-.3-.3-.5-.7-.5-1.2 0-1.1.9-2 2-2h2.2A4.8 4.8 0 0 0 21 9.8C21 6 17 3 12 3" />
        <circle cx="7.5" cy="11" r="1.2" />
        <circle cx="10.5" cy="7" r="1.2" />
        <circle cx="15" cy="7.5" r="1.2" />
      </Icon>
    ),
  },
  {
    name: "Video Compressor",
    group: "media",
    description: "Shrink videos on your computer and save them next to the originals.",
    href: "/video-compressor",
    jp: "動画圧縮",
    icon: (
      <Icon>
        <rect x="3" y="6" width="13" height="12" rx="2" />
        <path d="m16 10 5-3v10l-5-3" />
        <path d="M7.5 10.5 9.5 12.5 7.5 14.5M12 10.5 10 12.5 12 14.5" />
      </Icon>
    ),
  },
  {
    name: "Logo to SVG",
    group: "media",
    description: "Trace a PNG or JPG logo into a clean SVG, single or multi-color.",
    href: "/logo-to-svg",
    jp: "ロゴ変換",
    icon: (
      <Icon>
        <path d="M4 20c4-1 6-5 8-9s4-7 8-7" />
        <circle cx="4" cy="20" r="1.6" />
        <circle cx="20" cy="4" r="1.6" />
        <path d="M12 11h4" />
      </Icon>
    ),
  },
  {
    name: "Headshot Maker",
    group: "media",
    description: "Auto-detect the face in a photo and crop it into a profile picture.",
    href: "/headshot",
    jp: "顔写真",
    icon: (
      <Icon>
        <path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" />
        <circle cx="12" cy="10" r="3" />
        <path d="M7 18c.8-2.4 2.7-3.5 5-3.5s4.2 1.1 5 3.5" />
      </Icon>
    ),
  },
  {
    name: "Code Editor",
    group: "site",
    description: "Write HTML and CSS in a VS Code-style editor with a live preview.",
    href: "/code-editor",
    jp: "コード編集",
    icon: (
      <Icon>
        <path d="m8 7-5 5 5 5M16 7l5 5-5 5M13.5 5l-3 14" />
      </Icon>
    ),
  },
  {
    name: "Section Library",
    group: "site",
    description: "Ready-made homepage headings, profile sections and content layouts to copy as HTML and CSS.",
    href: "/sections",
    jp: "セクション集",
    icon: (
      <Icon>
        <rect x="3" y="4" width="18" height="7" rx="1.5" />
        <rect x="3" y="14" width="8" height="6" rx="1.5" />
        <path d="M14.5 15.5h6M14.5 18.5h4" />
      </Icon>
    ),
  },
  {
    name: "Audit",
    group: "site",
    description: "SEO, broken pages, dead links, spelling, and site-wide search for links, words, colors and letter case on LP sites.",
    href: "/audit",
    jp: "サイト監査",
    icon: (
      <Icon>
        <path d="M9 11l2 2 4-4" />
        <path d="M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6z" />
      </Icon>
    ),
  },
  {
    name: "Content Checker",
    group: "site",
    description: "Check whether your copy is on a site, and see what's missing or changed.",
    href: "/content-check",
    jp: "原稿チェック",
    icon: (
      <Icon>
        <path d="M11 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v2.5" />
        <path d="M14 3v5h5" />
        <circle cx="16" cy="16" r="3.2" />
        <path d="m18.4 18.4 2.6 2.6" />
        <path d="M8.5 12h3" />
      </Icon>
    ),
  },
  {
    name: "Drive Video Thumbnail",
    group: "media",
    description: "Grab and download the thumbnail of a public Google Drive video.",
    href: "/drive-thumbnail",
    jp: "ドライブ",
    icon: (
      <Icon>
        <path d="M8.5 4h7l5 8.5-3.5 6h-10L3.5 12.5z" />
        <path d="m10.5 9.5 4 2.5-4 2.5z" />
      </Icon>
    ),
  },
  {
    name: "YouTube Video",
    group: "media",
    description: "Get a video's thumbnail, title, and an autoplay embed link.",
    href: "/youtube",
    jp: "動画情報",
    icon: (
      <Icon>
        <rect x="2.5" y="5.5" width="19" height="13" rx="3.5" />
        <path d="m10 9.5 5 2.5-5 2.5z" />
      </Icon>
    ),
  },
  {
    name: "YouTube Channel",
    group: "media",
    description: "List every upload on a channel with copyable links.",
    href: "/channel",
    jp: "チャンネル",
    icon: (
      <Icon>
        <rect x="3" y="3" width="7.5" height="7.5" rx="1.5" />
        <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" />
        <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" />
        <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" />
      </Icon>
    ),
  },
  {
    name: "Notes",
    group: "site",
    description: "Client notes with links, ticket and opportunity notes, and a highlighter. Stays open while you use other tools.",
    href: "/notes",
    jp: "メモ",
    icon: (
      <Icon>
        <path d="M5 4h10l4 4v12H5z" />
        <path d="M15 4v4h4" />
        <path d="M8.5 12h7M8.5 15.5h7M8.5 8.5h3" />
      </Icon>
    ),
  },
  {
    name: "Phone Formatter",
    group: "site",
    description: "Clean up a US phone number into the format you need.",
    href: "/phone-formatter",
    jp: "電話番号整形",
    icon: (
      <Icon>
        <path d="M5 4h3.5l1.5 4.5-2 1.5a11 11 0 0 0 6 6l1.5-2 4.5 1.5V19a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />
      </Icon>
    ),
  },
  {
    name: "Error Log",
    group: "site",
    description: "Errors logged by every tool, grouped, with details to copy or download.",
    href: "/error-log",
    jp: "エラー記録",
    icon: (
      <Icon>
        <path d="M12 3 2.5 19.5h19z" />
        <path d="M12 10v4.5" />
        <path d="M12 17.5h.01" />
      </Icon>
    ),
  },
  {
    name: "AI Rewrite",
    group: "site",
    description: "Fix grammar or make text formal or polite with Gemini or Claude, using your own key.",
    href: "/rewrite",
    jp: "AI添削",
    icon: (
      <Icon>
        <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z" />
        <path d="m13.5 6.5 4 4" />
        <path d="M19 15l.8 1.7 1.7.8-1.7.8L19 20l-.8-1.7-1.7-.8 1.7-.8z" />
      </Icon>
    ),
  },
];
