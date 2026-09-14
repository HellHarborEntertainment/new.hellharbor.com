const catalog = document.querySelector("#catalog");
const cartToggle = document.querySelector("#cart-toggle");
const cartClose = document.querySelector("#cart-close");
const cartPanel = document.querySelector("#cart-panel");

cartToggle?.addEventListener("click", () => { cartPanel.hidden = false; });
cartClose?.addEventListener("click", () => { cartPanel.hidden = true; });

loadCatalog();

async function loadCatalog() {
  try {
    const response = await fetch("/api/catalog");
    const data = await response.json();
    const products = data.products || [];

    if (!products.length) {
      catalog.innerHTML = '<div class="empty">The physical media catalog is being configured. No products are live yet.</div>';
      return;
    }

    catalog.innerHTML = products.map((product) => `
      <article class="product-card">
        <span class="format">${escapeHtml(product.format)}</span>
        <h3>${escapeHtml(product.title)}</h3>
        <p class="description">${escapeHtml(product.description || "")}</p>
        <div class="product-footer">
          <span class="price">${money(product.retailPriceCents)}</span>
          <button class="button" type="button" disabled>Checkout integration pending</button>
        </div>
      </article>
    `).join("");
  } catch {
    catalog.innerHTML = '<div class="empty">Catalog unavailable.</div>';
  }
}

function money(cents) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;"
  })[character]);
}
