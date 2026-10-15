import { bundleViewer } from "./bundle-viewer.mjs";
import { mkdir } from "node:fs/promises";
await bundleViewer({ share: true });
