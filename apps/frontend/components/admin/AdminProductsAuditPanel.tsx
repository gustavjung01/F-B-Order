"use client";

import { useAuth } from "@clerk/nextjs";
import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from "react";
import { AdminApiError, adminApiFetch } from "@/lib/admin-api";

type ProductStatus = "needs_review" | "active" | "draft" | "inactive";
type StockStatus = "available" | "out_of_stock" | "preorder" | "discontinued";

type AdminProduct = {
  id: string;
  slug: string;
  sku: string | null;
  name: string;
  brand: string | null;
  categoryId: string;
  categoryName: string;
  subcategoryId: string | null;
  subcategoryName: string | null;
  productType: "physical" | "bundle" | "service";
  catalogKind: "sku_candidate" | "bundle_candidate";
  packageSizeLabel: string | null;
  unitLabel: string | null;
  origin: string | null;
  basePrice: number;
  wholesalePrice: number | null;
  minOrderQty: number;
  imageUrl: string | null;
  stockStatus: StockStatus;
  status: ProductStatus;
  dataIssues: string[];
  catalogEligible: boolean;
  isOrderable: boolean;
  isActive: boolean;
  isPublic: boolean;
  sourceKey: string;
  bundleItemCount: number;
  updatedAt: string;
};

type ProductDraft = {
  sku: string;
  unitLabel: string;
  packageSizeLabel: string;
  origin: string;
  imageUrl: string;
  basePrice: string;
  wholesalePrice: string;
  minOrderQty: string;
  stockStatus: StockStatus;
  status: ProductStatus;
  isPublic: boolean;
  isActive: boolean;
  isOrderable: boolean;
};

const issueLabels: Record<string, string> = {
  missing_package_size: "Thiếu quy cách",
  missing_unit: "Thiếu đơn vị",
  missing_price: "Thiếu giá bán",
  missing_price_retail: "Thiếu giá lẻ",
  missing_price_wholesale: "Thiếu giá sỉ",
  missing_image: "Thiếu ảnh",
  missing_origin: "Thiếu xuất xứ",
  missing_sku: "Thiếu SKU",
  needs_official_sku: "Cần SKU công ty",
  not_public: "Chưa công khai",
  inactive: "Đang tắt hoạt động",
  ordering_disabled: "Chưa bật đặt hàng",
  missing_bundle_components: "Combo chưa có thành phần",
  invalid_bundle_components: "Thành phần combo chưa hợp lệ",
  invalid_status: "Trạng thái chưa cho phép bán",
  discontinued: "Sản phẩm đã ngừng kinh doanh",
};

const filterOptions = [
  ["all", "Tất cả sản phẩm"],
  ["ready", "Đủ điều kiện bán"],
  ["ordering_disabled", issueLabels.ordering_disabled],
  ["missing_sku", issueLabels.missing_sku],
  ["missing_unit", issueLabels.missing_unit],
  ["missing_price", issueLabels.missing_price],
  ["missing_package_size", issueLabels.missing_package_size],
  ["missing_origin", issueLabels.missing_origin],
  ["missing_image", issueLabels.missing_image],
] as const;

function toDraft(product: AdminProduct): ProductDraft {
  return {
    sku: product.sku || "",
    unitLabel: product.unitLabel || "",
    packageSizeLabel: product.packageSizeLabel || "",
    origin: product.origin || "",
    imageUrl: product.imageUrl || "",
    basePrice: product.basePrice > 0 ? String(product.basePrice) : "",
    wholesalePrice: product.wholesalePrice && product.wholesalePrice > 0
      ? String(product.wholesalePrice)
      : "",
    minOrderQty: String(product.minOrderQty || 1),
    stockStatus: product.stockStatus,
    status: product.status,
    isPublic: product.isPublic,
    isActive: product.isActive,
    isOrderable: product.isOrderable,
  };
}

function money(value: number | null): string {
  if (!value || value <= 0) return "Chưa có";
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value);
}

function errorText(error: unknown): string {
  if (error instanceof AdminApiError) {
    const issues = error.details && typeof error.details === "object" && "dataIssues" in error.details
      ? (error.details as { dataIssues?: unknown }).dataIssues
      : null;
    if (Array.isArray(issues)) {
      const labels = issues
        .filter((issue): issue is string => typeof issue === "string")
        .map((issue) => issueLabels[issue] || issue);
      if (labels.length) return `${error.message}: ${labels.join(", ")}.`;
    }
    return `${error.message} (${error.code})`;
  }
  return error instanceof Error ? error.message : "Có lỗi không xác định.";
}

function parseOptionalMoney(value: string): number | null {
  const normalized = value.trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error("Giá phải là số không âm.");
  }
  return parsed;
}

export function AdminProductsAuditPanel() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ProductDraft | null>(null);
  const [filter, setFilter] = useState<(typeof filterOptions)[number][0]>("all");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const token = useCallback(async () => {
    const value = await getToken();
    if (!value) throw new Error("Không lấy được Clerk token admin.");
    return value;
  }, [getToken]);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const authToken = await token();
      const result = await adminApiFetch<{ products: AdminProduct[]; total: number }>(
        "/api/admin/products?limit=200",
        authToken,
      );
      setProducts(result.products);
      setSelectedId((current) => {
        if (current && result.products.some((product) => product.id === current)) return current;
        return result.products[0]?.id || null;
      });
    } catch (loadError) {
      setError(errorText(loadError));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (isLoaded && isSignedIn) void loadProducts();
  }, [isLoaded, isSignedIn, loadProducts]);

  const selectedProduct = useMemo(
    () => products.find((product) => product.id === selectedId) || null,
    [products, selectedId],
  );

  useEffect(() => {
    setDraft(selectedProduct ? toDraft(selectedProduct) : null);
    setError(null);
    setNotice(null);
  }, [selectedProduct]);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return products.filter((product) => {
      if (filter === "ready" && !(product.catalogEligible && product.isOrderable)) return false;
      if (filter !== "all" && filter !== "ready" && !product.dataIssues.includes(filter)) return false;
      if (!needle) return true;
      return `${product.name} ${product.brand || ""} ${product.sku || ""} ${product.slug}`
        .toLowerCase()
        .includes(needle);
    });
  }, [filter, products, query]);

  const updateDraft = <K extends keyof ProductDraft,>(key: K, value: ProductDraft[K]) => {
    setDraft((current) => (current ? { ...current, [key]: value } : current));
  };

  const saveProduct = async (overrides: Partial<ProductDraft> = {}) => {
    if (!selectedProduct || !draft) return;
    const nextDraft = { ...draft, ...overrides };
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const authToken = await token();
      const minOrderQty = Number(nextDraft.minOrderQty);
      if (!Number.isInteger(minOrderQty) || minOrderQty < 1) {
        throw new Error("Số lượng đặt tối thiểu phải là số nguyên từ 1 trở lên.");
      }
      const result = await adminApiFetch<{ product: AdminProduct }>(
        `/api/admin/products/${selectedProduct.id}`,
        authToken,
        {
          method: "PATCH",
          body: JSON.stringify({
            sku: nextDraft.sku.trim() || null,
            unitLabel: nextDraft.unitLabel.trim() || null,
            packageSizeLabel: nextDraft.packageSizeLabel.trim() || null,
            origin: nextDraft.origin.trim() || null,
            imageUrl: nextDraft.imageUrl.trim() || null,
            basePrice: parseOptionalMoney(nextDraft.basePrice),
            wholesalePrice: parseOptionalMoney(nextDraft.wholesalePrice),
            minOrderQty,
            stockStatus: nextDraft.stockStatus,
            status: nextDraft.status,
            isPublic: nextDraft.isPublic,
            isActive: nextDraft.isActive,
            isOrderable: nextDraft.isOrderable,
          }),
        },
      );
      setProducts((current) => current.map((product) => (
        product.id === result.product.id ? result.product : product
      )));
      setDraft(toDraft(result.product));
      setNotice(result.product.isOrderable
        ? "Đã lưu và sản phẩm đang cho phép đặt hàng."
        : "Đã lưu dữ liệu vận hành.");
    } catch (saveError) {
      setError(errorText(saveError));
    } finally {
      setSaving(false);
    }
  };

  const enableSelling = async () => {
    await saveProduct({
      isPublic: true,
      isActive: true,
      isOrderable: true,
      status: "active",
      stockStatus: draft?.stockStatus === "discontinued" ? "available" : draft?.stockStatus,
    });
  };

  const copySmokeProductId = async () => {
    if (!selectedProduct) return;
    try {
      await navigator.clipboard.writeText(selectedProduct.id);
      setNotice("Đã copy ID để dán vào PHASE7_SMOKE_PRODUCT_ID.");
    } catch {
      setError(`Không copy tự động được. ID sản phẩm: ${selectedProduct.id}`);
    }
  };

  if (!isLoaded) {
    return <section className="rounded-[28px] bg-white p-6 font-bold text-slate-700">Đang tải phiên đăng nhập…</section>;
  }

  if (!isSignedIn) {
    return <section className="rounded-[28px] bg-white p-6 font-bold text-slate-700">Anh cần đăng nhập tài khoản admin.</section>;
  }

  return (
    <div className="space-y-4">
      <section className="rounded-[28px] bg-white p-5 text-slate-950 shadow-xl">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-orange-600">Catalog vận hành</p>
            <h2 className="mt-2 text-3xl font-black">Chỉnh dữ liệu và bật bán</h2>
            <p className="mt-2 max-w-3xl text-sm font-bold leading-6 text-slate-600">
              Điền SKU, đơn vị và ít nhất một mức giá. Nút Bật bán sẽ đồng thời công khai, kích hoạt và mở đặt hàng.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadProducts()}
            disabled={loading}
            className="h-12 rounded-2xl bg-slate-950 px-5 font-black text-white disabled:opacity-50"
          >
            {loading ? "Đang tải…" : "Làm mới dữ liệu"}
          </button>
        </div>
      </section>

      {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-800">{error}</div> : null}
      {notice ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">{notice}</div> : null}

      <section className="grid gap-4 xl:grid-cols-[minmax(340px,0.8fr)_minmax(560px,1.2fr)]">
        <div className="rounded-[28px] bg-white p-4 text-slate-950 shadow-xl">
          <div className="grid gap-3 sm:grid-cols-[1fr_auto] xl:grid-cols-1">
            <input
              value={query}
              onChange={(event: ChangeEvent<HTMLInputElement>) => setQuery(event.target.value)}
              placeholder="Tìm tên, SKU, thương hiệu…"
              className="h-12 rounded-2xl bg-slate-100 px-4 font-bold outline-none"
            />
            <select
              value={filter}
              onChange={(event: ChangeEvent<HTMLSelectElement>) => setFilter(event.target.value as typeof filter)}
              className="h-12 rounded-2xl bg-slate-100 px-4 font-black outline-none"
            >
              {filterOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
          <p className="mt-3 text-xs font-black uppercase tracking-[0.12em] text-slate-500">{rows.length} sản phẩm</p>

          <div className="mt-3 max-h-[70vh] space-y-2 overflow-y-auto pr-1">
            {rows.map((product) => {
              const ready = product.catalogEligible && product.isOrderable;
              return (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => setSelectedId(product.id)}
                  className={`block w-full rounded-2xl border p-4 text-left transition ${
                    selectedId === product.id
                      ? "border-orange-400 bg-orange-50"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-black">{product.name}</p>
                      <p className="mt-1 truncate text-xs font-bold text-slate-500">{product.sku || "Chưa có SKU"} · {product.categoryName}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-black ${
                      ready ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                    }`}>
                      {ready ? "Đang bán" : `${product.dataIssues.length} lỗi`}
                    </span>
                  </div>
                  <p className="mt-3 text-sm font-black text-slate-700">Giá sỉ: {money(product.wholesalePrice || product.basePrice)}</p>
                </button>
              );
            })}
            {!rows.length ? <p className="p-5 text-center text-sm font-bold text-slate-500">Không có sản phẩm phù hợp.</p> : null}
          </div>
        </div>

        <div className="rounded-[28px] bg-white p-5 text-slate-950 shadow-xl">
          {!selectedProduct || !draft ? (
            <p className="py-20 text-center font-bold text-slate-500">Chọn một sản phẩm để chỉnh.</p>
          ) : (
            <div className="space-y-5">
              <div className="flex flex-col gap-3 border-b border-slate-200 pb-5 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-orange-600">{selectedProduct.id}</p>
                  <h3 className="mt-1 text-2xl font-black">{selectedProduct.name}</h3>
                  <p className="mt-1 text-sm font-bold text-slate-500">{selectedProduct.brand || "Chưa có thương hiệu"} · {selectedProduct.categoryName}</p>
                </div>
                <span className={`self-start rounded-full px-3 py-1.5 text-xs font-black ${
                  selectedProduct.catalogEligible && selectedProduct.isOrderable
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-amber-100 text-amber-800"
                }`}>
                  {selectedProduct.catalogEligible && selectedProduct.isOrderable ? "Đủ điều kiện đặt hàng" : "Chưa đủ điều kiện"}
                </span>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Field label="SKU công ty" value={draft.sku} onChange={(value) => updateDraft("sku", value)} placeholder="VD: ONA-TRA-001" />
                <Field label="Đơn vị bán" value={draft.unitLabel} onChange={(value) => updateDraft("unitLabel", value)} placeholder="Gói, chai, thùng…" />
                <Field label="Quy cách" value={draft.packageSizeLabel} onChange={(value) => updateDraft("packageSizeLabel", value)} placeholder="VD: Túi 1 kg" />
                <Field label="Xuất xứ" value={draft.origin} onChange={(value) => updateDraft("origin", value)} placeholder="VD: Việt Nam" />
                <Field label="Giá lẻ" type="number" value={draft.basePrice} onChange={(value) => updateDraft("basePrice", value)} placeholder="0" />
                <Field label="Giá sỉ" type="number" value={draft.wholesalePrice} onChange={(value) => updateDraft("wholesalePrice", value)} placeholder="0" />
                <Field label="Số lượng đặt tối thiểu" type="number" value={draft.minOrderQty} onChange={(value) => updateDraft("minOrderQty", value)} placeholder="1" />
                <label className="grid gap-1.5 text-sm font-black">
                  Tình trạng kho
                  <select value={draft.stockStatus} onChange={(event: ChangeEvent<HTMLSelectElement>) => updateDraft("stockStatus", event.target.value as StockStatus)} className="h-12 rounded-2xl bg-slate-100 px-4 outline-none">
                    <option value="available">Có hàng</option>
                    <option value="preorder">Đặt trước</option>
                    <option value="out_of_stock">Hết hàng</option>
                    <option value="discontinued">Ngừng kinh doanh</option>
                  </select>
                </label>
                <label className="grid gap-1.5 text-sm font-black">
                  Trạng thái catalog
                  <select value={draft.status} onChange={(event: ChangeEvent<HTMLSelectElement>) => updateDraft("status", event.target.value as ProductStatus)} className="h-12 rounded-2xl bg-slate-100 px-4 outline-none">
                    <option value="needs_review">Cần rà soát</option>
                    <option value="active">Đang hoạt động</option>
                    <option value="draft">Bản nháp</option>
                    <option value="inactive">Ngừng hiển thị</option>
                  </select>
                </label>
                <div className="md:col-span-2">
                  <Field label="URL ảnh chính" value={draft.imageUrl} onChange={(value) => updateDraft("imageUrl", value)} placeholder="https://…" />
                </div>
              </div>

              <div className="grid gap-3 rounded-2xl bg-slate-100 p-4 sm:grid-cols-3">
                <Toggle label="Công khai" checked={draft.isPublic} onChange={(value) => updateDraft("isPublic", value)} />
                <Toggle label="Hoạt động" checked={draft.isActive} onChange={(value) => updateDraft("isActive", value)} />
                <Toggle label="Cho phép đặt" checked={draft.isOrderable} onChange={(value) => updateDraft("isOrderable", value)} />
              </div>

              <div>
                <p className="text-sm font-black">Dữ liệu còn thiếu</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {selectedProduct.dataIssues.length
                    ? selectedProduct.dataIssues.map((issue) => (
                      <span key={issue} className="rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-800">
                        {issueLabels[issue] || issue}
                      </span>
                    ))
                    : <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-800">Không còn lỗi vận hành</span>}
                </div>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <button type="button" onClick={() => void saveProduct()} disabled={saving} className="h-12 rounded-2xl bg-slate-950 px-5 font-black text-white disabled:opacity-50">
                  {saving ? "Đang lưu…" : "Lưu dữ liệu"}
                </button>
                <button type="button" onClick={() => void enableSelling()} disabled={saving} className="h-12 rounded-2xl bg-orange-500 px-5 font-black text-white disabled:opacity-50">
                  Bật bán sản phẩm
                </button>
                {selectedProduct.catalogEligible && selectedProduct.isOrderable ? (
                  <button type="button" onClick={() => void copySmokeProductId()} className="h-12 rounded-2xl bg-emerald-600 px-5 font-black text-white">
                    Copy ID chạy smoke test
                  </button>
                ) : null}
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

type FieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: "text" | "number";
};

function Field({ label, value, onChange, placeholder, type = "text" }: FieldProps) {
  return (
    <label className="grid gap-1.5 text-sm font-black">
      {label}
      <input
        type={type}
        min={type === "number" ? 0 : undefined}
        step={type === "number" ? 1 : undefined}
        value={value}
        onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-12 rounded-2xl bg-slate-100 px-4 outline-none focus:ring-2 focus:ring-orange-300"
      />
    </label>
  );
}

type ToggleProps = {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
};

function Toggle({ label, checked, onChange }: ToggleProps) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl bg-white px-3 py-3 text-sm font-black">
      {label}
      <input type="checkbox" checked={checked} onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.checked)} className="h-5 w-5 accent-orange-500" />
    </label>
  );
}
