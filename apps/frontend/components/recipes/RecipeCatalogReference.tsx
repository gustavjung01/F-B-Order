import type { PublicRecipeCatalogReference } from "@/data/recipes/public-model";
import { catalogAvailabilityClass, catalogAvailabilityLabel } from "./recipe-detail-utils";

export function RecipeCatalogReference({ reference }: { reference: PublicRecipeCatalogReference }) {
  const productName = reference.snapshot.productName || reference.current.productName || "Sản phẩm Bếp Sỉ";
  const variantName = reference.snapshot.variantName || reference.current.variantName;
  const sku = reference.snapshot.sku || reference.current.sku;

  return (
    <div className="mt-3 rounded-[18px] bg-[#fbfaf7] p-3 ring-1 ring-[#eee7dc]">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ring-1 ${catalogAvailabilityClass(reference)}`}>
          {catalogAvailabilityLabel(reference)}
        </span>
        {reference.savedCartReady ? (
          <span className="rounded-full bg-[#f4efff] px-2.5 py-1 text-[10px] font-black text-[#7c3aed] ring-1 ring-[#dccbff]">
            Đã đủ dữ liệu quy đổi
          </span>
        ) : null}
      </div>
      <p className="mt-2 text-[13px] font-black text-[#0b1220]">{productName}</p>
      {variantName ? <p className="mt-1 text-[12px] font-bold text-slate-500">{variantName}</p> : null}
      {reference.snapshot.specification ? (
        <p className="mt-1 text-[12px] font-semibold text-slate-500">{reference.snapshot.specification}</p>
      ) : null}
      {sku ? <p className="mt-1 text-[11px] font-bold text-slate-400">SKU: {sku}</p> : null}
      {Object.keys(reference.selections).length ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {Object.entries(reference.selections).map(([key, value]) => (
            <span key={key} className="rounded-full bg-white px-2.5 py-1 text-[10px] font-black text-slate-500 ring-1 ring-[#eee7dc]">
              {key}: {value}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
