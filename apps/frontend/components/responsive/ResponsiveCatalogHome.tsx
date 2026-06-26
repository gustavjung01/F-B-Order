"use client";

import { createElement, useSyncExternalStore } from "react";
import { DesktopHomeIndustry } from "@/components/desktop/DesktopHomeIndustry";
import { ProductHomeTea } from "@/components/mobile/ProductHomeTea";
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

export function ResponsiveCatalogHome(props: {
  active?: AppNavKey;
  initialCatalog: CatalogV2ListResponse | null;
}) {
  const isDesktop = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  if (isDesktop) {
    return createElement(DesktopHomeIndustry, {
      active: props.active ?? "home",
      initialCatalog: props.initialCatalog,
    });
  }
  return createElement(ProductHomeTea, {
    active: props.active ?? "home",
    initialCatalog: props.initialCatalog,
  });
}
