import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ShuttleSync - Badminton Tournament Tracker",
    short_name: "ShuttleSync",
    description: "Manage badminton matches, random doubles pairings, and real-time live tournament scoreboards.",
    start_url: "/",
    display: "standalone",
    background_color: "#000000",
    theme_color: "#090714",
    icons: [
      {
        src: "/icons/icon-192x192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
