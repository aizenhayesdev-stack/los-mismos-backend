import { Response } from "express";
import { CustomRequest } from "../interfaces/auth";
import ResponseUtil from "../utils/Response/responseUtils";
// import ServicesModel from "../models/services.model";
import { STATUS_CODES } from "../constants/statusCodes";
import { MISC_CONSTANTS } from "../constants/messages";
import { CustomError } from "../classes/CustomError";

// export const allLocs = async (req: CustomRequest, res: Response) => {
//     try {
//         const [services] = await Promise.all([
//             ServicesModel.find().populate("icon").exec()
//         ])
//         return ResponseUtil.successResponse(
//             res,
//             STATUS_CODES.SUCCESS,
//             { services },
//             MISC_CONSTANTS.ALL_LOCS_FETCHED
//         );
//     }
//     catch (err) {
//         if (err instanceof CustomError)
//             return ResponseUtil.errorResponse(res, err.statusCode, err.message);
//         ResponseUtil.handleError(res, err);
//     }
// }