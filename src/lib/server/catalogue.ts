import "server-only";

import { fallbackServices, toService } from "@/lib/catalogue";
import type { CatalogueService, Product } from "@/lib/commerce";
import type { Service } from "@/lib/site-content";

/**
 * The public catalogue and products, read from the KUSH API (the source of
 * truth for prices). Cached for a minute so pages stay fast; null when the
 * API can't be reached, so pages can fall back to their built-in copy.
 */

const apiUrl = () => process.env.KUSH_API_URL ?? "http://127.0.0.1:4310";

async function read<T>(path: string): Promise<T | null> {
  try {
    const response = await fetch(`${apiUrl()}${path}`, {
      next: { revalidate: 60 },
      signal: AbortSignal.timeout(5_000),
    });
    return response.ok ? ((await response.json()) as T) : null;
  } catch {
    return null;
  }
}

export async function loadCatalogue() {
  return (await read<{ services: CatalogueService[] }>("/public/catalogue"))?.services ?? null;
}

export async function loadProducts() {
  return read<{ payments: boolean; products: Product[] }>("/public/products");
}

/** Services for the public pages: live from the API, else the built-in copy. */
export async function loadServices(): Promise<Service[]> {
  const live = await loadCatalogue();
  return live?.length ? live.map(toService) : fallbackServices;
}
