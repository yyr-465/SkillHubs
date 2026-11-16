import { inventoryManifestSchema } from "../shared/inventory/manifest.ts";

process.stdout.write(JSON.stringify(inventoryManifestSchema, null, 2) + "\n");
