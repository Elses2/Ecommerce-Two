/**
 * Servicio de promociones (spec §6.6b): banners promocionales hardcodeados.
 * No hay tabla ni repository — contenido de marketing no vinculado al schema.
 * Si más adelante se administra desde un panel, ahí sí ameritaría una tabla
 * `promotions` (explícitamente fuera de alcance ahora, spec §6.6b).
 */
export interface PromoBanner {
  /** Título principal de la promoción. */
  title: string;
  /** Subtítulo opcional informativo. */
  subtitle?: string;
  /** Ruta o URL de la imagen promocional. */
  imageUrl: string;
  /** URL de destino al hacer clic. */
  linkUrl?: string;
}

export const promoService = {
  /**
   * Obtiene la lista de banners promocionales activos para la aplicación.
   *
   * Los banners sirven `/img/fallback.png` como placeholder local (spec §6.6b).
   * Si ese archivo no existe o la imagen falla al cargar, el `onerror` del
   * template (`product-hero.ejs`) cae a `fallbackImageUrl`
   * (`env.images.fallbackUrl`, variable FALLBACK_IMAGE_URL).
   *
   * @returns {PromoBanner[]} Arreglo de objetos de banners promocionales.
   */
  getActiveBanners(): PromoBanner[] {
    return [
      {
        title: "50% OFF en Combo Plus",
        subtitle: "Canjeando 50.000 puntos",
        imageUrl: "/img/fallback.png",
        linkUrl: "/products?promo=combo-plus",
      },
      {
        title: "50% OFF en HBO Max",
        subtitle: "Canjeando 50.000 puntos",
        imageUrl: "/img/fallback.png",
        linkUrl: "/products?promo=hbo-max",
      },
    ];
  },
};