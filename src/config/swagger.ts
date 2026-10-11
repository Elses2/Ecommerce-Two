import swaggerJSDoc from "swagger-jsdoc";

/**
 * Especificación OpenAPI generada a partir de los comentarios
 * `@swagger` distribuidos en los controllers y routes.
 */
const spec = swaggerJSDoc({
  definition: {
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
      securitySchemes: {
        // Autenticación por JWT en el header Authorization (spec §23.2/§10).
        bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
      },
      schemas: {
        User: {
          type: "object",
          properties: {
            id: { type: "integer" },
            name: { type: "string" },
            email: { type: "string" },
            role: { type: "string", enum: ["customer", "admin"] },
          },
        },
        AuthResponse: {
          type: "object",
          properties: {
            user: { $ref: "#/components/schemas/User" },
            token: { type: "string" },
          },
        },
        RegisterRequest: {
          type: "object",
          required: ["name", "lastname", "email", "password"],
          properties: {
            name: { type: "string" },
            lastname: { type: "string" },
            email: { type: "string", format: "email" },
            password: { type: "string", minLength: 8, maxLength: 72 },
          },
        },
        LoginRequest: {
          type: "object",
          required: ["email", "password"],
          properties: {
            email: { type: "string", format: "email" },
            password: { type: "string" },
          },
        },
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
        Order: {
          type: "object",
          properties: {
            id: { type: "integer" },
            user_id: { type: "integer" },
            created_at: { type: "string", nullable: true },
            status: {
              type: "string",
              enum: ["pending", "paid", "failed", "cancelled"],
            },
            total: { type: "number" },
            payment_method: { type: "string", nullable: true },
          },
        },
        OrderItem: {
          type: "object",
          properties: {
            id: { type: "integer" },
            order_id: { type: "integer" },
            product_id: { type: "integer" },
            quantity: { type: "integer" },
            unit_price: { type: "number" },
            product_name: { type: "string" },
          },
        },
      },
    },
  },
  apis: [
    "./src/routes/api/*.routes.ts",
    "./src/controllers/api/*.controller.ts",
    "./src/controllers/pages/pages.controller.ts",
    "./src/controllers/pages/checkout.controller.ts",
  ],
});

export default spec;
