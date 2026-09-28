import swaggerJSDoc from "swagger-jsdoc";

const definition = {
  openapi: "3.0.0",
  info: {
    title: "MiEcommerce API",
    version: "1.0.0",
    description:
      "API REST del monolito MiEcommerce — TypeScript + Express + EJS. " +
      "Cubre endpoints de productos, categorías, carrito y órdenes.",
  },
  servers: [
    {
      url: "http://localhost:3000",
      description: "Entorno de desarrollo local",
    },
  ],
  components: {
    schemas: {
      Cart: {
        type: "object",
        properties: {
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                productId: { type: "integer" },
                quantity: { type: "integer" },
                name: { type: "string" },
                price: { type: "number" },
                image_url: { type: "string" },
              },
            },
          },
          total: { type: "number" },
          count: { type: "integer" },
        },
      },
      Product: {
        type: "object",
        properties: {
          id: { type: "integer" },
          name: { type: "string" },
          description: { type: "string" },
          price: { type: "number" },
          stock: { type: "integer" },
          image_url: { type: "string" },
          categories: {
            type: "array",
            items: { type: "string" },
          },
        },
      },
    },
  },
};

const apis = [
  "./src/routes/api/*.routes.ts",
  "./src/controllers/api/*.controller.ts",
  "./src/controllers/pages/pages.controller.ts",
];

/**
 * Especificación OpenAPI generada a partir de los comentarios
 * `@swagger` distribuidos en los controllers y routes.
 */
const spec = swaggerJSDoc(definition, { apis });

export default spec;
