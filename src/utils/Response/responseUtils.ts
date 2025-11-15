import { Response } from "express";
import { ZodError } from "zod";
import { ICustomError } from "../../interfaces/custom-error.interface";



class ResponseUtil {
  static successResponse(
    res: Response,
    statusCode: number,
    data = {},
    message: string = ""
  ) {
    res.status(statusCode).json({
      status: statusCode,
      data,
      success: true,
      message,
    });
  }

  static errorResponse(res: Response, statusCode: number, message: string) {
    res.status(statusCode).json({
      statusCode: statusCode,
      success: false,
      message,
    });
  }

  static handleError(res: Response, err: ZodError | Error | ICustomError | any) {
    if (err instanceof ZodError) {
      const errorMessage: any = err.errors.map((er) => ({
        field: er.path.join("."),
        message: er.message,
      }));
      return ResponseUtil.errorResponse(res, 400, errorMessage);
    } else if ("statusCode" in err && typeof err.statusCode === "number") {
      // This is a custom error
      return ResponseUtil.errorResponse(
        res,
        err.statusCode,
        err.message || "Internal server error"
      );
    }
    else {
      return ResponseUtil.errorResponse(
        res,
        500,
        err.message || "Internal server error"
      );
    }
  }
}

export default ResponseUtil;
