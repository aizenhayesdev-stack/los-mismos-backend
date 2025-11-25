import { Response, NextFunction } from "express";
import { CustomRequest } from "../interfaces/auth";
import ResponseUtil from "../utils/Response/responseUtils";
import { STATUS_CODES } from "../constants/statusCodes";

export const checkRole = (allowedRoles: string[]) => {
  return (req: CustomRequest, res: Response, next: NextFunction) => {
    if (!req.role) {
      return ResponseUtil.errorResponse(
        res,
        STATUS_CODES.UNAUTHORIZED,
        "Role not found in request"
      );
    }

    if (!allowedRoles.includes(req.role)) {
      return ResponseUtil.errorResponse(
        res,
        STATUS_CODES.FORBIDDEN,
        "Insufficient permissions"
      );
    }

    next();
  };
};
