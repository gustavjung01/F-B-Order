(() => {
  const select = document.getElementById("cat");
  const data = document.getElementById("data");
  if (!select || !data) return;

  const payload = JSON.parse(data.textContent);
  const preferredOrder = [
    "Nguyên Liệu Trà Sữa",
    "Nguyên Liệu Mì Cay",
    "Đông Lạnh",
    "Nguyên Liệu Bánh Tráng",
    "Bao Bì",
  ];

  const counts = new Map();
  for (const product of payload.products || []) {
    counts.set(product.category, (counts.get(product.category) || 0) + 1);
  }

  const remaining = [...counts.keys()]
    .filter((category) => !preferredOrder.includes(category))
    .sort((a, b) => a.localeCompare(b, "vi"));
  const categories = [...preferredOrder, ...remaining]
    .filter((category) => counts.has(category));

  select.innerHTML = [
    `<option value="all">Tất cả ngành hàng (${payload.products.length})</option>`,
    ...categories.map((category) =>
      `<option value="${category.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}">${category} (${counts.get(category)})</option>`,
    ),
  ].join("");
})();
