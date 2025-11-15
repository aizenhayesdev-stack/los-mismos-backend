import jwt from "jsonwebtoken";
import AuthConfig from "../../config/authConfig";
import { JwtPayload } from "../../interfaces/auth";

export const generateToken = (payload: JwtPayload) => {
  const token = jwt.sign(payload, AuthConfig.JWT_SECRET as string, {
    expiresIn: AuthConfig.EXPIRES_IN,
  });
  return token;
};
