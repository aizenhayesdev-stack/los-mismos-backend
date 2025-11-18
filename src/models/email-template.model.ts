import { Schema, model, Document } from "mongoose";
import { ObjectId } from "./common/types";

// Email template enums
export enum TemplateCategory {
  BOOKING = "booking",
  PAYMENT = "payment",
  SCHEDULE = "schedule",
  SUPPORT = "support",
  MARKETING = "marketing",
  SYSTEM = "system",
  NOTIFICATION = "notification",
}

export enum TemplateStatus {
  DRAFT = "draft",
  ACTIVE = "active",
  INACTIVE = "inactive",
  ARCHIVED = "archived",
}

export enum VariableType {
  STRING = "string",
  NUMBER = "number",
  DATE = "date",
  BOOLEAN = "boolean",
  OBJECT = "object",
  ARRAY = "array",
}

// Interfaces
export interface TemplateVariable {
  name: string;
  type: VariableType;
  required: boolean;
  defaultValue?: any;
  description: string;
  validation?: {
    pattern?: string;
    minLength?: number;
    maxLength?: number;
    min?: number;
    max?: number;
  };
}

export interface TemplateVersion {
  version: number;
  subject: string;
  htmlContent: string;
  textContent: string;
  variables: TemplateVariable[];
  author: ObjectId;
  changeLog: string;
  createdAt: Date;
}

export interface TemplateAnalytics {
  sentCount: number;
  deliveredCount: number;
  openedCount: number;
  clickedCount: number;
  bouncedCount: number;
  unsubscribedCount: number;
  openRate: number;
  clickRate: number;
  bounceRate: number;
  lastSent?: Date;
}

export interface IEmailTemplate extends Document {
  name: string;
  slug: string;
  category: TemplateCategory;
  status: TemplateStatus;
  subject: string;
  htmlContent: string;
  textContent: string;
  variables: TemplateVariable[];
  previewText?: string;
  fromName?: string;
  fromEmail?: string;
  replyTo?: string;
  tags: string[];
  versions: TemplateVersion[];
  analytics: TemplateAnalytics;
  settings: {
    trackOpens: boolean;
    trackClicks: boolean;
    enableUnsubscribe: boolean;
    requireDoubleOptIn: boolean;
  };
  scheduling: {
    isScheduled: boolean;
    sendAt?: Date;
    timezone?: string;
    recurring?: {
      enabled: boolean;
      frequency: "daily" | "weekly" | "monthly";
      interval: number;
      endDate?: Date;
    };
  };
  testData?: Record<string, any>; // Sample data for testing
  author: ObjectId;
  lastModifiedBy: ObjectId;
  approvedBy?: ObjectId;
  approvedAt?: Date;
  language: string;
  translations: Array<{
    language: string;
    templateId: ObjectId;
  }>;
  createdAt: Date;
  updatedAt: Date;
}

// Email Template Schema
const EmailTemplateSchema = new Schema<IEmailTemplate>(
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
    category: {
      type: String,
      enum: Object.values(TemplateCategory),
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: Object.values(TemplateStatus),
      default: TemplateStatus.DRAFT,
      index: true,
    },
    subject: {
      type: String,
      required: true,
      maxlength: 200,
    },
    htmlContent: {
      type: String,
      required: true,
    },
    textContent: {
      type: String,
      required: true,
    },
    variables: [
      {
        name: { type: String, required: true },
        type: {
          type: String,
          enum: Object.values(VariableType),
          required: true,
        },
        required: { type: Boolean, default: false },
        defaultValue: Schema.Types.Mixed,
        description: { type: String, required: true },
        validation: {
          pattern: String,
          minLength: Number,
          maxLength: Number,
          min: Number,
          max: Number,
        },
      },
    ],
    previewText: {
      type: String,
      maxlength: 150,
    },
    fromName: String,
    fromEmail: String,
    replyTo: String,
    tags: [
      {
        type: String,
        lowercase: true,
        trim: true,
      },
    ],
    versions: [
      {
        version: { type: Number, required: true },
        subject: { type: String, required: true },
        htmlContent: { type: String, required: true },
        textContent: { type: String, required: true },
        variables: [
          {
            name: String,
            type: String,
            required: Boolean,
            defaultValue: Schema.Types.Mixed,
            description: String,
          },
        ],
        author: { type: Schema.Types.ObjectId, ref: "Auth", required: true },
        changeLog: String,
        createdAt: { type: Date, default: Date.now },
      },
    ],
    analytics: {
      sentCount: { type: Number, default: 0 },
      deliveredCount: { type: Number, default: 0 },
      openedCount: { type: Number, default: 0 },
      clickedCount: { type: Number, default: 0 },
      bouncedCount: { type: Number, default: 0 },
      unsubscribedCount: { type: Number, default: 0 },
      openRate: { type: Number, default: 0 },
      clickRate: { type: Number, default: 0 },
      bounceRate: { type: Number, default: 0 },
      lastSent: Date,
    },
    settings: {
      trackOpens: { type: Boolean, default: true },
      trackClicks: { type: Boolean, default: true },
      enableUnsubscribe: { type: Boolean, default: true },
      requireDoubleOptIn: { type: Boolean, default: false },
    },
    scheduling: {
      isScheduled: { type: Boolean, default: false },
      sendAt: Date,
      timezone: String,
      recurring: {
        enabled: { type: Boolean, default: false },
        frequency: {
          type: String,
          enum: ["daily", "weekly", "monthly"],
        },
        interval: { type: Number, min: 1 },
        endDate: Date,
      },
    },
    testData: { type: Schema.Types.Mixed },
    author: {
      type: Schema.Types.ObjectId,
      ref: "Auth",
      required: true,
      index: true,
    },
    lastModifiedBy: {
      type: Schema.Types.ObjectId,
      ref: "Auth",
      index: true,
    },
    approvedBy: {
      type: Schema.Types.ObjectId,
      ref: "Auth",
    },
    approvedAt: Date,
    language: {
      type: String,
      default: "en",
      index: true,
    },
    translations: [
      {
        language: { type: String, required: true },
        templateId: {
          type: Schema.Types.ObjectId,
          ref: "EmailTemplate",
          required: true,
        },
      },
    ],
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes
EmailTemplateSchema.index({ category: 1, status: 1 });
EmailTemplateSchema.index({ tags: 1 });
EmailTemplateSchema.index({ author: 1, createdAt: -1 });
EmailTemplateSchema.index({ name: "text", subject: "text" });
EmailTemplateSchema.index({ "analytics.sentCount": -1 });

// Virtual for current version
EmailTemplateSchema.virtual("currentVersion").get(function () {
  if (!this.versions || this.versions.length === 0) return 1;
  return Math.max(...this.versions.map((v) => v.version));
});

// Virtual for performance metrics
EmailTemplateSchema.virtual("performanceScore").get(function () {
  const openRate = this.analytics.openRate || 0;
  const clickRate = this.analytics.clickRate || 0;
  const bounceRate = this.analytics.bounceRate || 0;

  // Simple performance score calculation
  return (openRate * 0.4 + clickRate * 0.4 - bounceRate * 0.2) * 100;
});

// Pre-save middleware
EmailTemplateSchema.pre("save", function (next) {
  // Generate slug from name if not provided
  if (this.isModified("name") && !this.slug) {
    this.slug = this.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  }

  // Update analytics rates
  if (this.isModified("analytics")) {
    const {
      sentCount,
      deliveredCount,
      openedCount,
      clickedCount,
      bouncedCount,
    } = this.analytics;

    if (deliveredCount > 0) {
      this.analytics.openRate = openedCount / deliveredCount;
      this.analytics.clickRate = clickedCount / deliveredCount;
    }

    if (sentCount > 0) {
      this.analytics.bounceRate = bouncedCount / sentCount;
    }
  }

  // Create version entry for content changes
  if (
    (this.isModified("subject") ||
      this.isModified("htmlContent") ||
      this.isModified("textContent")) &&
    !this.isNew
  ) {
    const newVersion: TemplateVersion = {
      version: (this as any).currentVersion + 1,
      subject: this.subject,
      htmlContent: this.htmlContent,
      textContent: this.textContent,
      variables: [...this.variables],
      author: this.lastModifiedBy || this.author,
      changeLog: "Template content updated",
      createdAt: new Date(),
    };
    this.versions.push(newVersion);
  }

  next();
});

// Method to render template with variables
EmailTemplateSchema.methods.render = function (
  variables: Record<string, any> = {}
) {
  let renderedSubject = this.subject;
  let renderedHtml = this.htmlContent;
  let renderedText = this.textContent;

  // Validate required variables
  const missingVariables: string[] = [];
  this.variables.forEach((variable: TemplateVariable) => {
    if (variable.required && !(variable.name in variables)) {
      missingVariables.push(variable.name);
    }
  });

  if (missingVariables.length > 0) {
    throw new Error(
      `Missing required variables: ${missingVariables.join(", ")}`
    );
  }

  // Replace variables in content
  this.variables.forEach((variable: TemplateVariable) => {
    const value = variables[variable.name] ?? variable.defaultValue ?? "";
    const placeholder = new RegExp(`{{\\s*${variable.name}\\s*}}`, "g");

    renderedSubject = renderedSubject.replace(placeholder, String(value));
    renderedHtml = renderedHtml.replace(placeholder, String(value));
    renderedText = renderedText.replace(placeholder, String(value));
  });

  return {
    subject: renderedSubject,
    html: renderedHtml,
    text: renderedText,
  };
};

// Method to validate variables
EmailTemplateSchema.methods.validateVariables = function (
  variables: Record<string, any>
) {
  const errors: string[] = [];

  this.variables.forEach((variable: TemplateVariable) => {
    const value = variables[variable.name];

    // Check required variables
    if (
      variable.required &&
      (value === undefined || value === null || value === "")
    ) {
      errors.push(`Variable '${variable.name}' is required`);
      return;
    }

    if (value !== undefined && variable.validation) {
      const validation = variable.validation;

      // String validations
      if (variable.type === VariableType.STRING && typeof value === "string") {
        if (validation.minLength && value.length < validation.minLength) {
          errors.push(
            `Variable '${variable.name}' must be at least ${validation.minLength} characters`
          );
        }
        if (validation.maxLength && value.length > validation.maxLength) {
          errors.push(
            `Variable '${variable.name}' must be no more than ${validation.maxLength} characters`
          );
        }
        if (validation.pattern && !new RegExp(validation.pattern).test(value)) {
          errors.push(
            `Variable '${variable.name}' does not match required pattern`
          );
        }
      }

      // Number validations
      if (variable.type === VariableType.NUMBER && typeof value === "number") {
        if (validation.min !== undefined && value < validation.min) {
          errors.push(
            `Variable '${variable.name}' must be at least ${validation.min}`
          );
        }
        if (validation.max !== undefined && value > validation.max) {
          errors.push(
            `Variable '${variable.name}' must be no more than ${validation.max}`
          );
        }
      }
    }
  });

  return errors;
};

// Method to create test email
EmailTemplateSchema.methods.createTestEmail = function (
  testVariables?: Record<string, any>
) {
  const variables = testVariables || this.testData || {};

  // Fill in any missing variables with sample data
  this.variables.forEach((variable: TemplateVariable) => {
    if (!(variable.name in variables)) {
      switch (variable.type) {
        case VariableType.STRING:
          variables[variable.name] =
            variable.defaultValue || `Sample ${variable.name}`;
          break;
        case VariableType.NUMBER:
          variables[variable.name] = variable.defaultValue || 123;
          break;
        case VariableType.DATE:
          variables[variable.name] =
            variable.defaultValue || new Date().toISOString();
          break;
        case VariableType.BOOLEAN:
          variables[variable.name] = variable.defaultValue || true;
          break;
        default:
          variables[variable.name] = variable.defaultValue || "Sample Value";
      }
    }
  });

  return this.render(variables);
};

// Static method to find by category
EmailTemplateSchema.statics.findByCategory = function (
  category: TemplateCategory,
  status?: TemplateStatus
) {
  const query: any = { category };
  if (status) {
    query.status = status;
  }
  return this.find(query).sort({ name: 1 });
};

export default model<IEmailTemplate>("EmailTemplate", EmailTemplateSchema);
