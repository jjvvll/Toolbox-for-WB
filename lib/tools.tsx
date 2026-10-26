import type { ReactNode } from "react";

export type Tool = {
  name: string;
  description: string;
  href: string;
  icon: ReactNode;
  /** Tailwind classes for the icon tile. */
  accent: string;
};

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
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
    description: "Render page 1 of one or more PDFs to downloadable images.",
    href: "/pdf-cover",
    accent: "bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400",
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
    description: "Cover images for every video and PDF in a folder, made on your device.",
    href: "/folder-thumbnails",
    accent: "bg-orange-100 text-orange-600 dark:bg-orange-500/15 dark:text-orange-400",
    icon: (
      <Icon>
        <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <path d="m10 11 4 2.5-4 2.5z" />
      </Icon>
    ),
  },
  {
    name: "Color Palette",
    description: "Pick colors from a screenshot and try them on dark, light, and color-block layouts.",
    href: "/color-palette",
    accent: "bg-teal-100 text-teal-600 dark:bg-teal-500/15 dark:text-teal-400",
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
    description: "Shrink videos on your computer and save them next to the originals.",
    href: "/video-compressor",
    accent: "bg-indigo-100 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400",
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
    description: "Trace a PNG or JPG logo into a clean SVG, single or multi-color.",
    href: "/logo-to-svg",
    accent: "bg-fuchsia-100 text-fuchsia-600 dark:bg-fuchsia-500/15 dark:text-fuchsia-400",
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
    name: "Drive Video Thumbnail",
    description: "Grab and download the thumbnail of a public Google Drive video.",
    href: "/drive-thumbnail",
    accent: "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400",
    icon: (
      <Icon>
        <path d="M8.5 4h7l5 8.5-3.5 6h-10L3.5 12.5z" />
        <path d="m10.5 9.5 4 2.5-4 2.5z" />
      </Icon>
    ),
  },
  {
    name: "YouTube Video",
    description: "Get a video's thumbnail, title, and an autoplay embed link.",
    href: "/youtube",
    accent: "bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-400",
    icon: (
      <Icon>
        <rect x="2.5" y="5.5" width="19" height="13" rx="3.5" />
        <path d="m10 9.5 5 2.5-5 2.5z" />
      </Icon>
    ),
  },
  {
    name: "YouTube Channel",
    description: "List every upload on a channel with copyable links.",
    href: "/channel",
    accent: "bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-400",
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
    description: "Rich-text notes with folders, tags, and templates, stored in your browser.",
    href: "/notes",
    accent: "bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400",
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
    description: "Clean up a US phone number into the format you need.",
    href: "/phone-formatter",
    accent: "bg-sky-100 text-sky-600 dark:bg-sky-500/15 dark:text-sky-400",
    icon: (
      <Icon>
        <path d="M5 4h3.5l1.5 4.5-2 1.5a11 11 0 0 0 6 6l1.5-2 4.5 1.5V19a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />
      </Icon>
    ),
  },
];
