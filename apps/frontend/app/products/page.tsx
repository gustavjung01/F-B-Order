import { DesktopHome } from "@/components/desktop/DesktopHome";
import { ProductHome } from "@/components/mobile/ProductHome";

export default function ProductsPage() {
  return (
    <>
      <div className="md:hidden">
        <ProductHome active="products" />
      </div>
      <div className="hidden md:block">
        <DesktopHome />
      </div>
    </>
  );
}
