import { ICustomError } from "../interfaces/custom-error.interface";

export class CustomError extends Error implements ICustomError {
    statusCode: number;

    constructor(statusCode: number, message: string) {
        super(message);
        this.statusCode = statusCode;

        // Restore prototype chain
        Object.setPrototypeOf(this, new.target.prototype);
    }
}