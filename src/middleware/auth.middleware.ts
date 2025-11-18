import jwt from "jsonwebtoken";
import { Request, Response, NextFunction } from "express";
import AuthConfig from "../config/authConfig";

// Extend Request interface to include user
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        role: string;
      };
    }
  }
}

interface JwtPayload {
  authId: string;
  email: string;
  role: string;
  iat?: number;
  exp?: number;
}

/**
 * Middleware to authenticate token and set user in request
 */
export const authenticateToken = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const tokenHeader = req.headers["authorization"];

  if (!tokenHeader) {
    return res.status(401).json({ error: "Access token required" });
  }

  const token = tokenHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Access token required" });
  }

  try {
    jwt.verify(String(token), String(AuthConfig.JWT_SECRET), (err, decoded) => {
      if (err) {
        return res.status(403).json({ error: "Invalid or expired token" });
      }

      const decodedPayload = decoded as JwtPayload;
      req.user = {
        id: decodedPayload.authId,
        email: decodedPayload.email,
        role: decodedPayload.role
      };

      next();
    });
  } catch (error) {
    return res.status(403).json({ error: "Invalid token" });
  }
};

/**
 * Optional authentication middleware - sets user if token is provided
 */
export const optionalAuth = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const tokenHeader = req.headers["authorization"];

  if (!tokenHeader) {
    return next(); // Continue without user
  }

  const token = tokenHeader.split(" ")[1];

  if (!token) {
    return next(); // Continue without user
  }

  try {
    jwt.verify(String(token), String(AuthConfig.JWT_SECRET), (err, decoded) => {
      if (!err && decoded) {
        const decodedPayload = decoded as JwtPayload;
        req.user = {
          id: decodedPayload.authId,
          email: decodedPayload.email,
          role: decodedPayload.role
        };
      }
      next();
    });
  } catch (error) {
    next(); // Continue without user even if token is invalid
  }
};

/**
 * Middleware to check if user has required role
 */
export const requireRole = (roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }

    next();
  };
};

/**
 * Middleware to check if user is admin
 */
export const requireAdmin = requireRole(['admin', 'super_admin']);

/**
 * Middleware to check if user is staff (agent, manager, admin)
 */
export const requireStaff = requireRole(['agent', 'manager', 'admin', 'super_admin']);