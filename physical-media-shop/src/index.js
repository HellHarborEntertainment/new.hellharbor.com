import { publicCatalog } from "./catalog.js";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/catalog" && request.method === "GET") {
      return Response.json({ products: publicCatalog() });
    }

    if (url.pathname.startsWith("/api/")) {
      return Response.json(
        { error: "Commerce API adapter is not enabled in this scaffold." },
        { status: 501 }
      );
    }

    return env.ASSETS.fetch(request);
  }
};
