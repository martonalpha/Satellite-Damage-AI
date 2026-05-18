declare module "shpjs" {
  type GeoJsonLike = Record<string, unknown> | Array<Record<string, unknown>>;

  export default function shp(input: string | ArrayBuffer | Uint8Array): Promise<GeoJsonLike>;
}
