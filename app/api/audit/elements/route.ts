import data from "./lp-elements.json";

/** data-el-id → [element name, template name]. */
export type ElementMap = Record<string, [string, string]>;

// The official LP element names, served from behind the login rather than
// bundled into the page's JavaScript (which is public), since the list is LP's
// internal data.
export function GET() {
  return Response.json(data.elements as unknown as ElementMap, { headers: { "cache-control": "private, max-age=3600" } });
}
