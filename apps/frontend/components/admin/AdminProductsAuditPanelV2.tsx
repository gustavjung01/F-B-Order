"use client";

import { useAuth } from "@clerk/nextjs";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AdminAlert,
  AdminBadge,
  AdminButton,
  AdminDialog,
  AdminEmptyState,
  AdminField,
  AdminInput,
  AdminSelect,
  AdminStatCard,
  AdminSurface,
  AdminSurfaceBody,
  AdminSurfaceHeader,
  AdminToolbar,
} from "@/components/admin/ui/AdminUI";
import { AdminToggle } from "@/components/admin/ui/AdminToggle";
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
    wholesalePrice: product.wholesalePrice && product.wholesalePrice > 0 ? String(product.wholesalePrice) : "",
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
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(value);
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
      const labels = issues.filter((issue): issue is string => typeof issue === "string").map((issue) => issueLabels[issue] || issue);
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
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error("Giá phải là số không âm.");
  return parsed;
}

export function AdminProductsAuditPanelV2() {
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
      const result = await adminApiFetch<{ products: AdminProduct[]; total: number }>("/api/admin/products?limit=200", await token());
      setProducts(result.products);
      setSelectedId((current) => current && result.products.some((product) => product.id === current) ? current : null);
    } catch (loadError) {
      setError(errorText(loadError));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (isLoaded && isSignedIn) void loadProducts();
  }, [isLoaded, isSignedIn, loadProducts]);

  const selectedProduct = useMemo(() => products.find((product) => product.id === selectedId) || null, [products, selectedId]);

  useEffect(() => {
    setDraft(selectedProduct ? toDraft(selectedProduct) : null);
    setError(null);
    setNotice(null);
  }, [selectedProduct?.id]);

  useEffect(() => {
    if (!selectedId) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape" && !saving) setSelectedId(null); };
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
      return `${product.name} ${product.brand || ""} ${product.sku || ""} ${product.slug}`.toLowerCase().includes(needle);
    });
  }, [filter, products, query, typeFilter]);

  function updateDraft<K extends keyof ProductDraft>(key: K, value: ProductDraft[K]) {
    setDraft((current) => current ? { ...current, [key]: value } : current);
  }

  async function saveProduct(overrides: Partial<ProductDraft> = {}) {
    if (!selectedProduct || !draft) return;
    const nextDraft = { ...draft, ...overrides };
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const minOrderQty = Number(nextDraft.minOrderQty);
      if (!Number.isInteger(minOrderQty) || minOrderQty < 1) throw new Error("Số lượng đặt tối thiểu phải là số nguyên từ 1 trở lên.");
      const result = await adminApiFetch<{ product: AdminProduct }>(
        `/api/admin/products/${selectedProduct.id}`,
        await token(),
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
      setProducts((current) => current.map((product) => product.id === result.product.id ? result.product : product));
      setDraft(toDraft(result.product));
      setNotice(result.product.isOrderable ? "Đã lưu và sản phẩm đang cho phép đặt hàng." : "Đã lưu dữ liệu vận hành.");
    } catch (saveError) {
      setError(errorText(saveError));
    } finally {
      setSaving(false);
    }
  }

  async function enableSelling() {
    if (!draft) return;
    await saveProduct({
      isPublic: true,
      isActive: true,
      isOrderable: true,
      status: "active",
      stockStatus: draft.stockStatus === "discontinued" ? "available" : draft.stockStatus,
    });
  }

  async function copySmokeProductId() {
    if (!selectedProduct) return;
    try {
      await navigator.clipboard.writeText(selectedProduct.id);
      setNotice("Đã copy ID để dán vào PHASE7_SMOKE_PRODUCT_ID.");
    } catch {
      setError(`Không copy tự động được. ID sản phẩm: ${selectedProduct.id}`);
    }
  }

  const closeEditor = () => { if (!saving) setSelectedId(null); };

  if (!isLoaded) return <AdminAlert tone="info">Đang tải phiên đăng nhập…</AdminAlert>;
  if (!isSignedIn) return <AdminAlert tone="warning">Bạn cần đăng nhập tài khoản admin.</AdminAlert>;

  return (
    <div className="space-y-4">
      <AdminSurface>
        <AdminSurfaceHeader
          eyebrow="Catalog operations"
          title="Dữ liệu sản phẩm"
          description="Rà SKU, quy cách, giá, ảnh và trạng thái bán. Không thay đổi nghiệp vụ catalog trong đợt chuẩn hóa UI."
          actions={<AdminButton tone="dark" disabled={loading} onClick={() => void loadProducts()}>{loading ? "Đang tải…" : "Làm mới"}</AdminButton>}
        />
        <AdminSurfaceBody className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <AdminStatCard label="Tổng catalog" value={counts.all} />
            <AdminStatCard label="Hàng hóa" value={counts.physical} />
            <AdminStatCard label="Combo" value={counts.bundle} />
            <AdminStatCard label="Dịch vụ" value={counts.service} />
          </div>

          {error && !selectedProduct ? <AdminAlert tone="danger">{error}</AdminAlert> : null}
          {notice && !selectedProduct ? <AdminAlert tone="success">{notice}</AdminAlert> : null}

          <AdminToolbar>
            <AdminField label="Tìm sản phẩm" className="md:flex-1">
              <AdminInput value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tên, SKU, thương hiệu" />
            </AdminField>
            <AdminField label="Loại" className="md:w-52">
              <AdminSelect value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as ProductTypeFilter)}>
                {typeFilterOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </AdminSelect>
            </AdminField>
            <AdminField label="Trạng thái" className="md:w-56">
              <AdminSelect value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)}>
                {filterOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </AdminSelect>
            </AdminField>
            <p className="pb-2 text-sm font-bold text-slate-500">{rows.length} kết quả</p>
          </AdminToolbar>

          {rows.length === 0 ? (
            <AdminEmptyState title="Không có bản ghi phù hợp" />
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {rows.map((product) => {
                const ready = product.catalogEligible && product.isOrderable;
                return (
                  <button key={product.id} type="button" onClick={() => setSelectedId(product.id)} className="group rounded-[20px] border border-slate-200 bg-white p-4 text-left transition hover:-translate-y-0.5 hover:border-orange-300 hover:shadow-md focus:outline-none focus:ring-4 focus:ring-orange-100">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <AdminBadge>{productTypeLabel(product.productType)}</AdminBadge>
                          <AdminBadge tone={ready ? "success" : "warning"}>{ready ? "Đang bán" : `${product.dataIssues.length} lỗi`}</AdminBadge>
                        </div>
                        <p className="mt-3 line-clamp-2 font-black leading-5 text-slate-950">{product.name}</p>
                        <p className="mt-1 truncate text-xs font-medium text-slate-500">{product.sku || product.slug} · {product.categoryName}</p>
                      </div>
                      <span className="text-xl text-slate-300 group-hover:text-orange-500">→</span>
                    </div>
                    <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
                      <span className="text-sm font-black text-slate-700">Giá sỉ: {money(product.wholesalePrice || product.basePrice)}</span>
                      <span className="text-xs font-black text-orange-600">Chỉnh sửa</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </AdminSurfaceBody>
      </AdminSurface>

      <AdminDialog
        open={Boolean(selectedProduct && draft)}
        onClose={closeEditor}
        closeDisabled={saving}
        eyebrow={selectedProduct ? productTypeLabel(selectedProduct.productType) : undefined}
        title={selectedProduct?.name || "Chỉnh sản phẩm"}
        description={selectedProduct?.id}
        size="lg"
        footer={selectedProduct && draft ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <AdminButton tone="dark" size="lg" disabled={saving} onClick={() => void saveProduct()}>{saving ? "Đang lưu…" : "Lưu dữ liệu"}</AdminButton>
            <AdminButton tone="primary" size="lg" disabled={saving} onClick={() => void enableSelling()}>Bật bán sản phẩm</AdminButton>
            {selectedProduct.catalogEligible && selectedProduct.isOrderable ? <AdminButton tone="success" size="lg" onClick={() => void copySmokeProductId()}>Copy ID smoke test</AdminButton> : null}
          </div>
        ) : undefined}
      >
        {error ? <AdminAlert tone="danger" className="mb-4">{error}</AdminAlert> : null}
        {notice ? <AdminAlert tone="success" className="mb-4">{notice}</AdminAlert> : null}
        {selectedProduct && draft ? (
          <div className="space-y-5">
            <div className="flex flex-wrap gap-2">
              <AdminBadge tone="orange">{productTypeLabel(selectedProduct.productType)}</AdminBadge>
              <AdminBadge tone={selectedProduct.catalogEligible && selectedProduct.isOrderable ? "success" : "warning"}>
                {selectedProduct.catalogEligible && selectedProduct.isOrderable ? "Đủ điều kiện đặt hàng" : "Chưa đủ điều kiện"}
              </AdminBadge>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <AdminField label="SKU công ty"><AdminInput value={draft.sku} onChange={(event) => updateDraft("sku", event.target.value)} placeholder="VD: ONA-TRA-001" /></AdminField>
              <AdminField label="Đơn vị bán"><AdminInput value={draft.unitLabel} onChange={(event) => updateDraft("unitLabel", event.target.value)} placeholder="Gói, chai, thùng" /></AdminField>
              <AdminField label="Quy cách"><AdminInput value={draft.packageSizeLabel} onChange={(event) => updateDraft("packageSizeLabel", event.target.value)} placeholder="VD: Túi 1 kg" /></AdminField>
              <AdminField label="Xuất xứ"><AdminInput value={draft.origin} onChange={(event) => updateDraft("origin", event.target.value)} placeholder="VD: Việt Nam" /></AdminField>
              <AdminField label="Giá lẻ"><AdminInput type="number" min={0} value={draft.basePrice} onChange={(event) => updateDraft("basePrice", event.target.value)} /></AdminField>
              <AdminField label="Giá sỉ"><AdminInput type="number" min={0} value={draft.wholesalePrice} onChange={(event) => updateDraft("wholesalePrice", event.target.value)} /></AdminField>
              <AdminField label="Số lượng đặt tối thiểu"><AdminInput type="number" min={1} value={draft.minOrderQty} onChange={(event) => updateDraft("minOrderQty", event.target.value)} /></AdminField>
              <AdminField label="Tình trạng kho">
                <AdminSelect value={draft.stockStatus} onChange={(event) => updateDraft("stockStatus", event.target.value as StockStatus)}>
                  <option value="available">Có hàng</option><option value="preorder">Đặt trước</option><option value="out_of_stock">Hết hàng</option><option value="discontinued">Ngừng kinh doanh</option>
                </AdminSelect>
              </AdminField>
              <AdminField label="Trạng thái catalog">
                <AdminSelect value={draft.status} onChange={(event) => updateDraft("status", event.target.value as ProductStatus)}>
                  <option value="needs_review">Cần rà soát</option><option value="active">Đang hoạt động</option><option value="draft">Bản nháp</option><option value="inactive">Ngừng hiển thị</option>
                </AdminSelect>
              </AdminField>
              <AdminField label="URL ảnh chính" className="md:col-span-2"><AdminInput value={draft.imageUrl} onChange={(event) => updateDraft("imageUrl", event.target.value)} placeholder="https://" /></AdminField>
            </div>

            <div className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-3">
              <AdminToggle label="Công khai" checked={draft.isPublic} onChange={(event) => updateDraft("isPublic", event.target.checked)} />
              <AdminToggle label="Hoạt động" checked={draft.isActive} onChange={(event) => updateDraft("isActive", event.target.checked)} />
              <AdminToggle label="Cho phép đặt" checked={draft.isOrderable} onChange={(event) => updateDraft("isOrderable", event.target.checked)} />
            </div>

            <div>
              <p className="text-sm font-black text-slate-900">Dữ liệu còn thiếu</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {selectedProduct.dataIssues.length
                  ? selectedProduct.dataIssues.map((issue) => <AdminBadge key={issue} tone="warning">{issueLabels[issue] || issue}</AdminBadge>)
                  : <AdminBadge tone="success">Không còn lỗi vận hành</AdminBadge>}
              </div>
            </div>
          </div>
        ) : null}
      </AdminDialog>
    </div>
  );
}
