import type { DataPage } from "./data-api";
import { ViewerError } from "./viewer-grants";
import { viewerHeaders } from "./viewer-access";
export function csvCell(value: unknown) {
  let text = String(value ?? "");
  if (/^[\s]*[=+@-]|^[\t\r\n]/.test(text)) text = "'" + text;
  return `"${text.replaceAll('"', '""')}"`;
}
/** One authorized bounded page per pull; cancellation stops database reads. */
export async function exportCsv(
  url: URL,
  read: (url: URL) => Promise<DataPage>,
  authorize: () => Promise<unknown>,
  signal: AbortSignal,
) {
  const start = new Date().toISOString();
  const pageUrl = new URL(url);
  pageUrl.searchParams.set("page", "0");
  pageUrl.searchParams.delete("run");
  await authorize();
  let page = await read(pageUrl);
  const selected =
    url.searchParams.get("columns")?.split(",") ?? page.fields.map((f) => f.id);
  if (
    !selected.length ||
    new Set(selected).size !== selected.length ||
    selected.some((id) => !page.fields.some((f) => f.id === id))
  )
    throw new ViewerError(
      400,
      "invalid_columns",
      "Choose authorized export columns.",
    );
  const indices = selected.map((id) =>
    page.fields.findIndex((f) => f.id === id),
  );
  let index = 0,
    header = true,
    done = false;
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        signal.throwIfAborted();
        await authorize();
        if (done) {
          controller.close();
          return;
        }
        if (index) {
          pageUrl.searchParams.set("page", String(index));
          page = await read(pageUrl);
        }
        let text = header
          ? indices.map((i) => csvCell(page.fields[i].label)).join(",") + "\r\n"
          : "";
        header = false;
        text += page.rows
          .map((row) => indices.map((i) => csvCell(row[i].value)).join(","))
          .join("\r\n");
        if (page.rows.length) text += "\r\n";
        done = !page.next;
        index++;
        controller.enqueue(encoder.encode(text));
      } catch (error) {
        controller.error(error);
      }
    },
    cancel() {
      done = true;
    },
  });
  return new Response(body, {
    headers: {
      ...viewerHeaders,
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="workflow-current-data.csv"',
      "x-export-started-at": start,
      "x-export-consistency": "live-paginated-read",
    },
  });
}
