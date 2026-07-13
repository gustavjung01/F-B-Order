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

type ProductTypeFilter = "all" | AdminProduct["productType"];

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
  ["all", "Tất cả trạng thái"],
  ["ready", "Đủ điều kiện bán"],
  ["ordering_disabled", issueLabels.ordering_disabled],
  ["missing_sku", issueLabels.missing_sku],
  ["missing_unit", issueLabels.missing_unit],
  ["missing_price", issueLabels.missing_price],
  ["missing_package_size", issueLabels.missing_package_size],
  ["missing_origin", issueLabels.missing_origin],
  ["missing_image", issueLabels.missing_image],
] as const;

const typeFilterOptions: ReadonlyArray<[ProductTypeFilter, string]> = [
  ["all", "Tất cả loại"],
  ["physical", "Sản phẩm hàng hóa"],
  ["bundle", "Combo gợi ý"],
  ["service", "Dịch vụ"],
];

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

function productTypeLabel(type: AdminProduct["productType"]): string {
  if (type === "bundle") return "Combo";
  if (type === "service") return "Dịch vụ";
  return "Hàng hóa";
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
  const [typeFilter, setTypeFilter] = useState<ProductTypeFilter>("all");
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
      setSelectedId((current) => (
        current && result.products.some((product) => product.id === current) ? current : null
      ));
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
  }, [selectedProduct?.id]);

  useEffect(() => {
    if (!selectedId) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) setSelectedId(null);
    };
    window.addEventListener("keydown", closeOnEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [saving, selectedId]);

  const counts = useMemo(() => ({
    all: products.length,
    physical: products.filter((product) => product.productType === "physical").length,
    bundle: products.filter((product) => product.productType === "bundle").length,
    service: products.filter((product) => product.productType === "service").length,
  }), [products]);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return products.filter((product) => {
      if (typeFilter !== "all" && product.productType !== typeFilter) return false;
      if (filter === "ready" && !(product.catalogEligible && product.isOrderable)) return false;
      if (filter !== "all" && filter !== "ready" && !product.dataIssues.includes(filter)) return false;
      if (!needle) return true;
      return `${product.name} ${product.brand || ""} ${product.sku || ""} ${product.slug}`
        .toLowerCase()
        .includes(needle);
    });
  }, [filter, products, query, typeFilter]);

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
    if (!draft) return;
    await saveProduct({
      isPublic: true,
      isActive: true,
      isOrderable: true,
      status: "active",
      stockStatus: draft.stockStatus === "discontinued" ? "available" : draft.stockStatus,
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

  const closeEditor = () => {
    if (!saving) setSelectedId(null);
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
              Danh sách gồm toàn bộ bản ghi catalog, kể cả combo và mục chưa công khai. Chạm vào một dòng để mở trình chỉnh sửa.
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

      {error && !selectedProduct ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-800">{error}</div>
      ) : null}
      {notice && !selectedProduct ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">{notice}</div>
      ) : null}

      <section className="rounded-[28px] bg-white p-4 text-slate-950 shadow-xl">
        <div className="grid gap-3 md:grid-cols-3">
          <input
            value={query}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setQuery(event.target.value)}
            placeholder="Tìm tên, SKU, thương hiệu…"
            className="h-12 rounded-2xl bg-slate-100 px-4 font-bold outline-none focus:ring-2 focus:ring-orange-300"
          />
          <select
            value={typeFilter}
            onChange={(event: ChangeEvent<HTMLSelectElement>) => setTypeFilter(event.target.value as ProductTypeFilter)}
            className="h-12 rounded-2xl bg-slate-100 px-4 font-black outline-none focus:ring-2 focus:ring-orange-300"
          >
            {typeFilterOptions.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <select
            value={filter}
            onChange={(event: ChangeEvent<HTMLSelectElement>) => setFilter(event.target.value as typeof filter)}
            className="h-12 rounded-2xl bg-slate-100 px-4 font-black outline-none focus:ring-2 focus:ring-orange-300"
          >
            {filterOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>

        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs font-black uppercase tracking-[0.1em] text-slate-500">
          <span>{counts.all} bản ghi catalog</span>
          <span>{counts.physical} hàng hóa</span>
          <span>{counts.bundle} combo</span>
          {counts.service > 0 ? <span>{counts.service} dịch vụ</span> : null}
          <span className="text-orange-600">{rows.length} kết quả đang hiển thị</span>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((product) => {
            const ready = product.catalogEligible && product.isOrderable;
            return (
              <button
                key={product.id}
                type="button"
                onClick={() => setSelectedId(product.id)}
                className="group block w-full rounded-[22px] border border-slate-200 bg-white p-4 text-left transition hover:-translate-y-0.5 hover:border-orange-300 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-orange-300"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.1em] text-slate-600">
                        {productTypeLabel(product.productType)}
                      </span>
                      <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${
                        ready ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                      }`}>
                        {ready ? "Đang bán" : `${product.dataIssues.length} lỗi`}
                      </span>
                    </div>
                    <p className="mt-3 line-clamp-2 font-black leading-5">{product.name}</p>
                    <p className="mt-1 truncate text-xs font-bold text-slate-500">
                      {product.sku || product.slug} · {product.categoryName}
                    </p>
                  </div>
                  <span aria-hidden="true" className="text-xl text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-orange-500">›</span>
                </div>
                <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
                  <span className="text-sm font-black text-slate-700">
                    Giá sỉ: {money(product.wholesalePrice || product.basePrice)}
                  </span>
                  <span className="text-xs font-black text-orange-600">Chỉnh sửa</span>
                </div>
              </button>
            );
          })}
          {!rows.length ? (
            <p className="rounded-2xl bg-slate-100 p-8 text-center text-sm font-bold text-slate-500 md:col-span-2 xl:col-span-3">
              Không có bản ghi phù hợp.
            </p>
          ) : null}
        </div>
      </section>

      {selectedProduct && draft ? (
        <div className="fixed inset-0 z-[120] flex items-end justify-center sm:items-center sm:p-4">
          <button
            type="button"
            aria-label="Đóng trình chỉnh sửa"
            onClick={closeEditor}
            className="absolute inset-0 bg-slate-950/75 backdrop-blur-sm"
          />

          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="product-editor-title"
            className="relative z-10 flex h-[94dvh] w-full flex-col overflow-hidden rounded-t-[28px] bg-white text-slate-950 shadow-2xl sm:h-auto sm:max-h-[calc(100dvh-2rem)] sm:max-w-4xl sm:rounded-[28px]"
          >
            <header className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-orange-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.1em] text-orange-700">
                    {productTypeLabel(selectedProduct.productType)}
                  </span>
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${
                    selectedProduct.catalogEligible && selectedProduct.isOrderable
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-amber-100 text-amber-800"
                  }`}>
                    {selectedProduct.catalogEligible && selectedProduct.isOrderable
                      ? "Đủ điều kiện đặt hàng"
                      : "Chưa đủ điều kiện"}
                  </span>
                </div>
                <h3 id="product-editor-title" className="mt-2 line-clamp-2 text-xl font-black sm:text-2xl">
                  {selectedProduct.name}
                </h3>
                <p className="mt-1 truncate text-xs font-bold text-slate-500">
                  {selectedProduct.id}
                </p>
              </div>
              <button
                type="button"
                onClick={closeEditor}
                disabled={saving}
                aria-label="Đóng"
                className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-slate-100 text-2xl font-black text-slate-700 disabled:opacity-50"
              >
                ×
              </button>
            </header>

            <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
              {error ? (
                <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-800">{error}</div>
              ) : null}
              {notice ? (
                <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">{notice}</div>
              ) : null}

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
                  <select
                    value={draft.stockStatus}
                    onChange={(event: ChangeEvent<HTMLSelectElement>) => updateDraft("stockStatus", event.target.value as StockStatus)}
                    className="h-12 rounded-2xl bg-slate-100 px-4 outline-none focus:ring-2 focus:ring-orange-300"
                  >
                    <option value="available">Có hàng</option>
                    <option value="preorder">Đặt trước</option>
                    <option value="out_of_stock">Hết hàng</option>
                    <option value="discontinued">Ngừng kinh doanh</option>
                  </select>
                </label>

                <label className="grid gap-1.5 text-sm font-black">
                  Trạng thái catalog
                  <select
                    value={draft.status}
                    onChange={(event: ChangeEvent<HTMLSelectElement>) => updateDraft("status", event.target.value as ProductStatus)}
                    className="h-12 rounded-2xl bg-slate-100 px-4 outline-none focus:ring-2 focus:ring-orange-300"
                  >
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

              <div className="mt-5 grid gap-3 rounded-2xl bg-slate-100 p-4 sm:grid-cols-3">
                <Toggle label="Công khai" checked={draft.isPublic} onChange={(value) => updateDraft("isPublic", value)} />
                <Toggle label="Hoạt động" checked={draft.isActive} onChange={(value) => updateDraft("isActive", value)} />
                <Toggle label="Cho phép đặt" checked={draft.isOrderable} onChange={(value) => updateDraft("isOrderable", value)} />
              </div>

              <div className="mt-5">
                <p className="text-sm font-black">Dữ liệu còn thiếu</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {selectedProduct.dataIssues.length
                    ? selectedProduct.dataIssues.map((issue) => (
                      <span key={issue} className="rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-800">
                        {issueLabels[issue] || issue}
                      </span>
                    ))
                    : (
                      <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-800">
                        Không còn lỗi vận hành
                      </span>
                    )}
                </div>
              </div>
            </div>

            <footer className="shrink-0 border-t border-slate-200 bg-white px-4 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-4 sm:px-6 sm:pb-5">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <button
                  type="button"
                  onClick={() => void saveProduct()}
                  disabled={saving}
                  className="h-12 rounded-2xl bg-slate-950 px-5 font-black text-white disabled:opacity-50"
                >
                  {saving ? "Đang lưu…" : "Lưu dữ liệu"}
                </button>
                <button
                  type="button"
                  onClick={() => void enableSelling()}
                  disabled={saving}
                  className="h-12 rounded-2xl bg-orange-500 px-5 font-black text-white disabled:opacity-50"
                >
                  Bật bán sản phẩm
                </button>
                {selectedProduct.catalogEligible && selectedProduct.isOrderable ? (
                  <button
                    type="button"
                    onClick={() => void copySmokeProductId()}
                    className="h-12 rounded-2xl bg-emerald-600 px-5 font-black text-white sm:col-span-2 lg:col-span-1"
                  >
                    Copy ID chạy smoke test
                  </button>
                ) : null}
              </div>
            </footer>
          </section>
        </div>
      ) : null}
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
      <input
        type="checkbox"
        checked={checked}
        onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.checked)}
        className="h-5 w-5 accent-orange-500"
      />
    </label>
  );
}
