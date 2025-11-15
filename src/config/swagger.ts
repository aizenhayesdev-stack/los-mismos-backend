import { SwaggerDefinition, Options } from "swagger-jsdoc";
import { PORT } from "./environment";

const swaggerDefinition: SwaggerDefinition = {
  openapi: "3.0.0",
  info: {
    title: "NodeJS Template",
    version: "1.0.0",
    description: "Write your description here",
  },
  servers: [
    {
      url: `http://localhost:${PORT}`,
      description: "Development server",
    },
  ],
};

const options: Options = {
  swaggerDefinition,
  apis: ["./src/routes/*.ts"],
};

export default options;
