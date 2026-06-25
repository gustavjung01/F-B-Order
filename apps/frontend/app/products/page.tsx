import { createElement } from "react";
import { ResponsiveCatalogHome } from "@/components/responsive/ResponsiveCatalogHome";
import { fetchInitialCatalogV2 } from "@/lib/catalog-v2-server";

export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  const initialCatalog = await fetchInitialCatalogV2().catch((error) => {
    console.error("initial products catalog render failed", error);
    return null;
  });

  return createElement(ResponsiveCatalogHome, {
    active: "home",
    initialCatalog,
  });
}
