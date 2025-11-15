import { Schema, model } from "mongoose";

const MediaSchema = new Schema(
  {
    type: {
      type: Schema.Types.String,
      default: "Image",
    },
    mimeType: {
      type: Schema.Types.String,
      default: "jpeg",
    },
    fieldName: {
      type: Schema.Types.String,
      default: "filedname"
    },
    fileName: {
      type: Schema.Types.String,
      default: "filename"
    },
    originalName: {
      type: Schema.Types.String,
      default: "originalname"
    },
    url: {
      type: Schema.Types.String,
      default: "",
    },
    isDeleted: {
      type: Schema.Types.Boolean,
      default: false,
    },
    isVisible: {
      type: Schema.Types.Boolean,
      default: true,
    },
    size: {
      type: Schema.Types.Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

const MediaModel = model("Media", MediaSchema);

export default MediaModel;
