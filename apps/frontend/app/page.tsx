import { ResponsiveCatalogHome } from "@/components/responsive/ResponsiveCatalogHome";
import { fetchInitialCatalogV2 } from "@/lib/catalog-v2-server";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const initialCatalog = await fetchInitialCatalogV2().catch((error) => {
    console.error("initial catalog render failed", error);
    return null;
  });

  return <ResponsiveCatalogHome active="home" initialCatalog={initialCatalog} />;
}
