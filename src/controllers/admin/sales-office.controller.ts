import { Request, Response } from "express";
import { STATUS_CODES } from "../../constants/statusCodes";
import ResponseUtil from "../../utils/Response/responseUtils";
import { ADMIN_CONSTANTS } from "../../constants/messages";
import { CustomError } from "../../classes/CustomError";
import Bus from "../../models/bus.model";
import { SeatLayoutType, SeatType, Seat } from "../../models/common/types";
import helper from "../../helper";
import OfficeModel from "../../models/office.model";


export const createSalesOffice = async (req: Request, res: Response) => {
    try {
      const { 
        name, 
        description, 
      } = req.body;

      // Check if bus with same code or serial number already exists
      const existingBus = await OfficeModel.findOne({
        name: name,
      });

      if (existingBus) {
        throw new CustomError(STATUS_CODES.CONFLICT, ADMIN_CONSTANTS.BUS_ALREADY_EXISTS);
      }

      // Generate seat layout
      // Create new bus
      const newOffice = new OfficeModel({
        name,
        description: description || null,
      });

      const savedOffice = await newOffice.save();

      return ResponseUtil.successResponse(
        res,
        STATUS_CODES.CREATED,
        {
            office:savedOffice
        },
        ADMIN_CONSTANTS.OFFICE_CREATED
      );
    } catch (err) {
      if (err instanceof CustomError)
        return ResponseUtil.errorResponse(res, err.statusCode, err.message);
      ResponseUtil.handleError(res, err);
    }
  };

export const getOffices = async (req: Request, res: Response) => {
  try {
    const { page, limit } = req.query;
    const query = { isActive: true, isDeleted: false };
    const options = {
      page: Number(page),
      limit: Number(limit),
      sort: { createdAt: -1 } as Record<string, 1 | -1>
    };
    const offices = await helper.PaginateHelper.customPaginate("offices", OfficeModel, query, options);
    return ResponseUtil.successResponse(res, STATUS_CODES.SUCCESS, { offices }, ADMIN_CONSTANTS.OFFICE_FETCHED);
  } catch (err) {
    if (err instanceof CustomError)
      return ResponseUtil.errorResponse(res, err.statusCode, err.message);
    ResponseUtil.handleError(res, err);
  }
}

export const updateSalesOffice = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, description } = req.body;
    const office = await OfficeModel.findByIdAndUpdate(id, { name, description }, { new: true });
    if (!office) {
      throw new CustomError(STATUS_CODES.NOT_FOUND, ADMIN_CONSTANTS.OFFICE_NOT_FOUND);
    }
    return ResponseUtil.successResponse(res, STATUS_CODES.SUCCESS, { office }, ADMIN_CONSTANTS.OFFICE_UPDATED);
  } catch (err) {
    if (err instanceof CustomError)
      return ResponseUtil.errorResponse(res, err.statusCode, err.message);
    ResponseUtil.handleError(res, err);
  }
}

export const deleteSalesOffice = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const office = await OfficeModel.findByIdAndUpdate(id, { isDeleted: true }, { new: true });
    if (!office) {
      throw new CustomError(STATUS_CODES.NOT_FOUND, ADMIN_CONSTANTS.OFFICE_NOT_FOUND);
    }
    return ResponseUtil.successResponse(res, STATUS_CODES.SUCCESS, { office }, ADMIN_CONSTANTS.OFFICE_DELETED);
  } catch (err) {
    if (err instanceof CustomError)
      return ResponseUtil.errorResponse(res, err.statusCode, err.message);
    ResponseUtil.handleError(res, err);
  }
}
