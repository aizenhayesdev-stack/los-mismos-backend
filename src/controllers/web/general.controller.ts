// import { Request, Response } from "express";
// import contactsModel from "../../models/contacts.model";
// import { sendEmail } from "../../utils/SendEmail";
// import { AUTH_CONSTANTS, WEB_CONSTANTS } from "../../constants/messages";
// import ResponseUtil from "../../utils/Response/responseUtils";
// import { STATUS_CODES } from "../../constants/statusCodes";
// import { CustomError } from "../../classes/CustomError";
// import { webEmailTemplate } from "../../utils/SendEmail/web-template";

// export const addContact = async (req: Request, res: Response) => {
//     try {
//         const { emailAddress, phoneNumber } = req.body;

//         if (!emailAddress || !phoneNumber) {
//             return res.status(400).json({
//                 status: "error",
//                 message: "Please fill all the fields (emailAddress and phoneNumber are required)",
//             });
//         }
//         const insertContact = new contactsModel({
//             emailAddress: emailAddress,
//             phoneNumber: phoneNumber,
//         });

//         await insertContact.save();

//         const template = webEmailTemplate(emailAddress, phoneNumber);

//         await sendEmail(emailAddress, WEB_CONSTANTS.CONTACT_ADDED_SUCCESSFULLY, template);

//         return ResponseUtil.successResponse(
//             res,
//             STATUS_CODES.SUCCESS,
//             {},
//             WEB_CONSTANTS.CONTACT_ADDED_SUCCESSFULLY
//         );
//         // return res.status(200).send({
//         //     success: true,
//         //     message: "Contact Added Successfully",
//         //     data: insertContact,
//         // });
//     } catch (err) {
//         if (err instanceof CustomError)
//             return ResponseUtil.errorResponse(res, err.statusCode, err.message);
//         ResponseUtil.handleError(res, err);
//     }
// };