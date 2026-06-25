"use client";

import { useSyncExternalStore } from "react";
import { DesktopHome } from "@/components/desktop/DesktopHome";
import { ProductHome } from "@/components/mobile/ProductHome";
import type { AppNavKey } from "@/components/navigation/app-navigation";
import type { CatalogV2ListResponse } from "@/data/catalog-v2/product-model";

const desktopQuery = "(min-width: 768px)";

function subscribe(callback: () => void) {
  const media = window.matchMedia(desktopQuery);
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}

function getSnapshot() {
  return window.matchMedia(desktopQuery).matches;
}

function getServerSnapshot() {
  return false;
}

export function ResponsiveCatalogHome({
  active = "home",
  initialCatalog,
}: {
  active?: AppNavKey;
  initialCatalog: CatalogV2ListResponse | null;
}) {
  const isDesktop = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return isDesktop
    ? <DesktopHome active={active} initialCatalog={initialCatalog} />
    : <ProductHome active={active} initialCatalog={initialCatalog} />;
}
