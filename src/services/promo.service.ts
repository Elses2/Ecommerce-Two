// Servicio de promociones (spec §6.6b): banners promocionales hardcodeados.
// No hay tabla ni repository — contenido de marketing no vinculado al schema.
// Si más adelante se administra desde un panel, ahí sí ameritaría una tabla
// `promotions` (explícitamente fuera de alcance ahora, spec §6.6b).
export interface PromoBanner {
  title: string;
  subtitle?: string;
  imageUrl: string;
  linkUrl?: string;
}

export const promoService = {
  getActiveBanners(): PromoBanner[] {
    // Los URLs de Cloudinary del ejemplo del spec contienen <cloud_name>:
    // son placeholders, no activos reales. Hasta configurar Cloudinary se
    // sirve el fallback local (misma postura que §2.2/§2.3 para productos).
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
