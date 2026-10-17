import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "GRWM — your wardrobe, remembered",
    short_name: "GRWM",
    description: "Log your daily outfit and build a searchable digital wardrobe.",
    start_url: "/",
    display: "standalone",
    background_color: "#f5f0ea",
    theme_color: "#f5f0ea",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
