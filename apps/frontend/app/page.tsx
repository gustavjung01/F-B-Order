import { DesktopHome } from "@/components/desktop/DesktopHome";
import { ProductHome } from "@/components/mobile/ProductHome";

export default function HomePage() {
  return (
    <>
      <div className="md:hidden">
        <ProductHome active="home" />
      </div>
      <div className="hidden md:block">
        <DesktopHome active="home" />
      </div>
    </>
  );
}
