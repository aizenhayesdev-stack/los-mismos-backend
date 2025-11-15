import { Request, Response, NextFunction } from "express";
import { ZodSchema, ZodError } from "zod";
import ResponseUtil from "../utils/Response/responseUtils";
import { STATUS_CODES } from "../constants/statusCodes";

export const validateBody = (schema: ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const errorMessages = error.errors.map((err) => ({
          field: err.path.join("."),
          message: err.message,
        }));

        return res.status(STATUS_CODES.BAD_REQUEST).json({
          statusCode: STATUS_CODES.BAD_REQUEST,
          success: false,
          message: "Validation failed",
          errors: errorMessages,
        });
      }

      return ResponseUtil.errorResponse(
        res,
        500,
        "Internal server error"
      );
    }
  };
};

export const validateQuery = (schema: ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      schema.parse(req.query);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const errorMessages = error.errors.map((err) => ({
          field: err.path.join("."),
          message: err.message,
        }));

        return res.status(STATUS_CODES.BAD_REQUEST).json({
          statusCode: STATUS_CODES.BAD_REQUEST,
          success: false,
          message: "Validation failed",
          errors: errorMessages,
        });
      }

      return ResponseUtil.errorResponse(
        res,
        500,
        "Internal server error"
      );
    }
  };
};

// Generic validate function for schemas with nested structure
export const validate = (schema: any) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      schema.parse(req);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const errorMessages = error.errors.map((err) => ({
          field: err.path.join("."),
          message: err.message,
        }));

        return res.status(STATUS_CODES.BAD_REQUEST).json({
          statusCode: STATUS_CODES.BAD_REQUEST,
          success: false,
          message: "Validation failed",
          errors: errorMessages,
        });
      }

      return ResponseUtil.errorResponse(
        res,
        500,
        "Internal server error"
      );
    }
  };
};