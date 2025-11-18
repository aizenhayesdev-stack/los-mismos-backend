import { Schema, model, Document } from "mongoose";
import { ObjectId } from "./common/types";

export interface IHelpCategory extends Document {
  name: string;
  slug: string;
  description: string;
  icon: string;
  color?: string;
  parentCategory?: ObjectId;
  subcategories: ObjectId[];
  sortOrder: number;
  isActive: boolean;
  articleCount: number;
  metadata: {
    seoTitle?: string;
    seoDescription?: string;
    keywords: string[];
  };
  permissions: {
    viewRoles: string[]; // Roles that can view this category
    editRoles: string[]; // Roles that can edit articles in this category
  };
  createdAt: Date;
  updatedAt: Date;
}

// Help Category Schema
const HelpCategorySchema = new Schema<IHelpCategory>(
  {
    name: {
      type: String,
      required: true,
      maxlength: 100,
      index: true,
    },
    slug: {
      type: String,
      unique: true,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    description: {
      type: String,
      maxlength: 500,
    },
    icon: {
      type: String,
      default: "help-circle",
    },
    color: {
      type: String,
      match: /^#[0-9A-F]{6}$/i,
      default: "#6B7280",
    },
    parentCategory: {
      type: Schema.Types.ObjectId,
      ref: "HelpCategory",
      index: true,
    },
    subcategories: [
      {
        type: Schema.Types.ObjectId,
        ref: "HelpCategory",
      },
    ],
    sortOrder: {
      type: Number,
      default: 0,
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    articleCount: {
      type: Number,
      default: 0,
    },
    metadata: {
      seoTitle: String,
      seoDescription: { type: String, maxlength: 160 },
      keywords: [String],
    },
    permissions: {
      viewRoles: [
        {
          type: String,
          enum: ["customer", "agent", "manager", "admin", "super_admin"],
          default: "customer",
        },
      ],
      editRoles: [
        {
          type: String,
          enum: ["agent", "manager", "admin", "super_admin"],
          default: "admin",
        },
      ],
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes
HelpCategorySchema.index({ parentCategory: 1, sortOrder: 1 });
HelpCategorySchema.index({ isActive: 1, sortOrder: 1 });
HelpCategorySchema.index({ name: "text", description: "text" });

// Virtual for depth level
HelpCategorySchema.virtual("level").get(function () {
  return this.parentCategory ? 1 : 0; // Simple 2-level hierarchy
});

// Virtual for full path
HelpCategorySchema.virtual("fullPath").get(function () {
  // This would need to be populated to work properly
  return this.parentCategory &&
    typeof this.parentCategory === "object" &&
    "name" in this.parentCategory
    ? `${(this.parentCategory as any).name} > ${this.name}`
    : this.name;
});

// Pre-save middleware
HelpCategorySchema.pre("save", function (next) {
  // Generate slug from name if not provided
  if (this.isModified("name") && !this.slug) {
    this.slug = this.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  }

  next();
});

// Post-save middleware to update parent's subcategories
HelpCategorySchema.post("save", async function () {
  if (this.parentCategory) {
    const Model = this.constructor as any;
    await Model.findByIdAndUpdate(this.parentCategory, {
      $addToSet: { subcategories: this._id },
    });
  }
});

// Method to update article count
HelpCategorySchema.methods.updateArticleCount = async function () {
  const HelpArticle = model("HelpArticle");
  const count = await HelpArticle.countDocuments({
    category: this._id,
    status: "published",
  });

  this.articleCount = count;
  return this.save();
};

// Static method to get category tree
HelpCategorySchema.statics.getCategoryTree = function () {
  return this.aggregate([
    { $match: { isActive: true } },
    {
      $lookup: {
        from: "helpcategories",
        localField: "_id",
        foreignField: "parentCategory",
        as: "children",
      },
    },
    {
      $match: { parentCategory: { $exists: false } },
    },
    { $sort: { sortOrder: 1, name: 1 } },
  ]);
};

export default model<IHelpCategory>("HelpCategory", HelpCategorySchema);
