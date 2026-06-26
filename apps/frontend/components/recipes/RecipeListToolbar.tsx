import type { RecipeFilterOption } from "./recipe-list-utils";

type RecipeListToolbarProps = {
  searchDraft: string;
  category: string;
  tag: string;
  categories: RecipeFilterOption[];
  tags: RecipeFilterOption[];
  total: number;
  loading: boolean;
  hasFilters: boolean;
  onSearchChange: (value: string) => void;
  onCategoryChange: (value: string) => void;
  onTagChange: (value: string) => void;
  onClear: () => void;
};

export function RecipeListToolbar(props: RecipeListToolbarProps) {
  return (
    <section className="rounded-[28px] bg-white p-4 shadow-[0_14px_32px_rgba(15,23,42,0.07)] ring-1 ring-[#efe7dc] md:p-5">
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px_220px]">
        <label className="block">
          <span className="sr-only">Tìm công thức</span>
          <input value={props.searchDraft} onChange={(event: React.ChangeEvent<HTMLInputElement>) => props.onSearchChange(event.target.value)} placeholder="Tìm món, tên gọi khác..." className="h-12 w-full rounded-[17px] border-0 bg-[#fbfaf7] px-4 text-[14px] font-bold text-[#0b1220] outline-none ring-1 ring-[#eee7dc] placeholder:text-slate-400 focus:ring-2 focus:ring-[#ffb58a]" />
        </label>
        <label className="block">
          <span className="sr-only">Lọc theo nhóm món</span>
          <select value={props.category} onChange={(event: React.ChangeEvent<HTMLSelectElement>) => props.onCategoryChange(event.target.value)} className="h-12 w-full rounded-[17px] border-0 bg-[#fbfaf7] px-4 text-[14px] font-black text-slate-700 outline-none ring-1 ring-[#eee7dc] focus:ring-2 focus:ring-[#dccbff]">
            <option value="">Tất cả nhóm món</option>
            {props.categories.map((option) => <option key={option.slug} value={option.slug}>{option.name}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="sr-only">Lọc theo thẻ</span>
          <select value={props.tag} onChange={(event: React.ChangeEvent<HTMLSelectElement>) => props.onTagChange(event.target.value)} className="h-12 w-full rounded-[17px] border-0 bg-[#fbfaf7] px-4 text-[14px] font-black text-slate-700 outline-none ring-1 ring-[#eee7dc] focus:ring-2 focus:ring-[#b9eadb]">
            <option value="">Tất cả chủ đề</option>
            {props.tags.map((option) => <option key={option.slug} value={option.slug}>{option.name}</option>)}
          </select>
        </label>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] font-bold text-slate-500">{props.loading ? "Đang cập nhật danh sách..." : `${props.total} công thức đã xuất bản`}</p>
        {props.hasFilters ? <button type="button" onClick={props.onClear} className="rounded-full bg-[#fff3ea] px-4 py-2 text-[12px] font-black text-[#ff5a00] ring-1 ring-[#ffd0b3]">Xóa bộ lọc</button> : null}
      </div>
    </section>
  );
}
