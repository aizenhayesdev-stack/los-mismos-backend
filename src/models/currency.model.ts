import { Schema, model } from "mongoose";

const currencySchema = new Schema({
    USD: {
        type: Number,
        required: true,
    },
    MXN: {
        type: Number,
        required: true,
    },
}, {
    timestamps: true
}
);

const currencyModel = model("currency", currencySchema);

export default currencyModel;
