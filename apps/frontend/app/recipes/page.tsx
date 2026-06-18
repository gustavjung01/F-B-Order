const recipes = [
  { name: "Tra sua dau nuong", time: "12 phut", items: ["Hong tra", "Bot sua", "Syrup dau nuong", "Tran chau"] },
  { name: "Mi cay kim chi hai san", time: "18 phut", items: ["Sot mi cay", "Mi Han", "Kim chi", "Topping hai san"] },
  { name: "Sua tuoi tran chau duong den", time: "10 phut", items: ["Sua tuoi", "Duong den", "Tran chau", "Kem beo"] },
];

export default function RecipesPage() {
  return (
    <main className="min-h-screen bg-[#f6f3ea] pb-20 text-slate-950">
      <section className="mx-auto max-w-6xl px-5 py-6">
        <div className="rounded-[2rem] bg-pink-950 p-6 text-white md:p-8">
          <p className="text-sm font-black uppercase text-pink-200">Noi dung giu chan khach</p>
          <h1 className="mt-2 text-4xl font-black">Cong thuc F&B</h1>
          <p className="mt-3 max-w-2xl text-pink-100">Khach xem cong thuc, bam them nguyen lieu vao gio. Day la diem khac biet cua app.</p>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {recipes.map((recipe, index) => (
            <article key={recipe.name} className="rounded-[1.75rem] bg-white p-5 shadow-sm ring-1 ring-black/5">
              <div className="grid h-36 place-items-center rounded-[1.5rem] bg-pink-50 text-6xl">🍓</div>
              <div className="mt-5 flex items-center justify-between">
                <span className="rounded-full bg-pink-50 px-3 py-1 text-xs font-black text-pink-700">Cong thuc #{index + 1}</span>
                <span className="text-sm font-bold text-slate-500">{recipe.time}</span>
              </div>
              <h2 className="mt-4 text-xl font-black">{recipe.name}</h2>
              <ul className="mt-4 space-y-2">
                {recipe.items.map((item) => (
                  <li key={item} className="rounded-2xl bg-slate-50 px-3 py-2 text-sm font-bold text-slate-600">{item}</li>
                ))}
              </ul>
              <button className="mt-5 w-full rounded-2xl bg-slate-950 px-5 py-3 font-black text-white">Them nguyen lieu</button>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
