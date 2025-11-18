import { Schema, model, Document } from "mongoose";
import { ObjectId } from "./common/types";

// Help article enums
export enum ArticleType {
  FAQ = "faq",
  TUTORIAL = "tutorial",
  GUIDE = "guide",
  TROUBLESHOOTING = "troubleshooting",
  POLICY = "policy",
  ANNOUNCEMENT = "announcement",
}

export enum ArticleDifficulty {
  BEGINNER = "beginner",
  INTERMEDIATE = "intermediate",
  ADVANCED = "advanced",
}

export enum ArticleStatus {
  DRAFT = "draft",
  PUBLISHED = "published",
  ARCHIVED = "archived",
  UNDER_REVIEW = "under_review",
}

// Interfaces
export interface ArticleAnalytics {
  viewCount: number;
  uniqueViewCount: number;
  helpfulVotes: number;
  unhelpfulVotes: number;
  averageTimeSpent: number; // in seconds
  searchAppearances: number;
  clickThroughRate: number;
  lastViewed?: Date;
}

export interface ArticleVersion {
  version: number;
  content: string;
  author: ObjectId;
  changeLog: string;
  createdAt: Date;
}

export interface IHelpArticle extends Document {
  title: string;
  slug: string;
  content: string;
  excerpt: string;
  category: ObjectId;
  subcategory?: string;
  tags: string[];
  type: ArticleType;
  difficulty: ArticleDifficulty;
  status: ArticleStatus;
  estimatedReadTime: number; // in minutes
  videoUrl?: string;
  videoThumbnail?: string;
  attachments: Array<{
    name: string;
    url: string;
    type: string;
    size: number;
  }>;
  relatedArticles: ObjectId[];
  prerequisites: ObjectId[]; // Articles that should be read first
  analytics: ArticleAnalytics;
  seo: {
    metaTitle?: string;
    metaDescription?: string;
    keywords: string[];
  };
  versions: ArticleVersion[];
  author: ObjectId;
  lastModifiedBy: ObjectId;
  reviewers: ObjectId[];
  publishedAt?: Date;
  scheduledPublishAt?: Date;
  expiresAt?: Date;
  language: string;
  translations: Array<{
    language: string;
    articleId: ObjectId;
  }>;
  createdAt: Date;
  updatedAt: Date;
}

// Help Article Schema
const HelpArticleSchema = new Schema<IHelpArticle>(
  {
    title: {
      type: String,
      required: true,
      maxlength: 200,
      index: "text",
    },
    slug: {
      type: String,
      unique: true,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    content: {
      type: String,
      required: true,
      index: "text",
    },
    excerpt: {
      type: String,
      maxlength: 500,
      index: "text",
    },
    category: {
      type: Schema.Types.ObjectId,
      ref: "HelpCategory",
      required: true,
      index: true,
    },
    subcategory: {
      type: String,
      index: true,
    },
    tags: [
      {
        type: String,
        lowercase: true,
        trim: true,
        index: true,
      },
    ],
    type: {
      type: String,
      enum: Object.values(ArticleType),
      required: true,
      index: true,
    },
    difficulty: {
      type: String,
      enum: Object.values(ArticleDifficulty),
      default: ArticleDifficulty.BEGINNER,
      index: true,
    },
    status: {
      type: String,
      enum: Object.values(ArticleStatus),
      default: ArticleStatus.DRAFT,
      index: true,
    },
    estimatedReadTime: {
      type: Number,
      min: 1,
      default: 1,
    },
    videoUrl: String,
    videoThumbnail: String,
    attachments: [
      {
        name: { type: String, required: true },
        url: { type: String, required: true },
        type: { type: String, required: true },
        size: { type: Number, required: true },
      },
    ],
    relatedArticles: [
      {
        type: Schema.Types.ObjectId,
        ref: "HelpArticle",
      },
    ],
    prerequisites: [
      {
        type: Schema.Types.ObjectId,
        ref: "HelpArticle",
      },
    ],
    analytics: {
      viewCount: { type: Number, default: 0 },
      uniqueViewCount: { type: Number, default: 0 },
      helpfulVotes: { type: Number, default: 0 },
      unhelpfulVotes: { type: Number, default: 0 },
      averageTimeSpent: { type: Number, default: 0 },
      searchAppearances: { type: Number, default: 0 },
      clickThroughRate: { type: Number, default: 0 },
      lastViewed: Date,
    },
    seo: {
      metaTitle: String,
      metaDescription: { type: String, maxlength: 160 },
      keywords: [String],
    },
    versions: [
      {
        version: { type: Number, required: true },
        content: { type: String, required: true },
        author: { type: Schema.Types.ObjectId, ref: "Auth", required: true },
        changeLog: String,
        createdAt: { type: Date, default: Date.now },
      },
    ],
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
    reviewers: [
      {
        type: Schema.Types.ObjectId,
        ref: "Auth",
      },
    ],
    publishedAt: Date,
    scheduledPublishAt: Date,
    expiresAt: Date,
    language: {
      type: String,
      default: "en",
      index: true,
    },
    translations: [
      {
        language: { type: String, required: true },
        articleId: {
          type: Schema.Types.ObjectId,
          ref: "HelpArticle",
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

// Indexes for performance and search
HelpArticleSchema.index({ title: "text", content: "text", excerpt: "text" });
HelpArticleSchema.index({ category: 1, status: 1, publishedAt: -1 });
HelpArticleSchema.index({ type: 1, difficulty: 1 });
HelpArticleSchema.index({ tags: 1, status: 1 });
HelpArticleSchema.index({ "analytics.viewCount": -1 });
HelpArticleSchema.index({ "analytics.helpfulVotes": -1 });
HelpArticleSchema.index({ author: 1, createdAt: -1 });
HelpArticleSchema.index({ status: 1, scheduledPublishAt: 1 });

// Virtual for helpfulness ratio
HelpArticleSchema.virtual("helpfulnessRatio").get(function () {
  const total = this.analytics.helpfulVotes + this.analytics.unhelpfulVotes;
  if (total === 0) return 0;
  return this.analytics.helpfulVotes / total;
});

// Virtual for current version
HelpArticleSchema.virtual("currentVersion").get(function () {
  if (!this.versions || this.versions.length === 0) return 1;
  return Math.max(...this.versions.map((v) => v.version));
});

// Virtual for reading time estimate
HelpArticleSchema.virtual("readingTimeText").get(function () {
  const minutes = this.estimatedReadTime;
  if (minutes < 1) return "Less than 1 minute";
  if (minutes === 1) return "1 minute";
  return `${minutes} minutes`;
});

// Virtual for popularity score
HelpArticleSchema.virtual("popularityScore").get(function () {
  const views = this.analytics.viewCount || 0;
  const helpful = this.analytics.helpfulVotes || 0;
  const unhelpful = this.analytics.unhelpfulVotes || 0;

  // Simple popularity algorithm
  return views * 0.1 + helpful * 2 - unhelpful * 0.5;
});

// Pre-save middleware
HelpArticleSchema.pre("save", function (next) {
  // Generate slug from title if not provided
  if (this.isModified("title") && !this.slug) {
    this.slug = this.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  }

  // Calculate estimated read time based on content
  if (this.isModified("content")) {
    const wordsPerMinute = 200;
    const wordCount = this.content.split(/\s+/).length;
    this.estimatedReadTime = Math.max(1, Math.ceil(wordCount / wordsPerMinute));
  }

  // Generate excerpt if not provided
  if (this.isModified("content") && !this.excerpt) {
    const plainText = this.content.replace(/<[^>]*>/g, ""); // Remove HTML tags
    this.excerpt =
      plainText.substring(0, 300) + (plainText.length > 300 ? "..." : "");
  }

  // Set published date when status changes to published
  if (
    this.isModified("status") &&
    this.status === ArticleStatus.PUBLISHED &&
    !this.publishedAt
  ) {
    this.publishedAt = new Date();
  }

  // Create version entry for content changes
  if (this.isModified("content") && !this.isNew) {
    const currentVersion =
      this.versions && this.versions.length > 0
        ? Math.max(...this.versions.map((v) => v.version))
        : 1;

    const newVersion = {
      version: currentVersion + 1,
      content: this.content,
      author: this.lastModifiedBy || this.author,
      changeLog: "Content updated",
      createdAt: new Date(),
    };
    this.versions.push(newVersion);
  }

  next();
});

// Method to record view
HelpArticleSchema.methods.recordView = function (
  userId?: ObjectId,
  timeSpent?: number
) {
  this.analytics.viewCount += 1;
  this.analytics.lastViewed = new Date();

  if (timeSpent) {
    const currentAvg = this.analytics.averageTimeSpent || 0;
    const viewCount = this.analytics.viewCount;
    this.analytics.averageTimeSpent =
      (currentAvg * (viewCount - 1) + timeSpent) / viewCount;
  }

  return this.save();
};

// Method to record vote
HelpArticleSchema.methods.recordVote = function (isHelpful: boolean) {
  if (isHelpful) {
    this.analytics.helpfulVotes += 1;
  } else {
    this.analytics.unhelpfulVotes += 1;
  }

  return this.save();
};

// Method to add related article
HelpArticleSchema.methods.addRelatedArticle = function (articleId: ObjectId) {
  if (!this.relatedArticles.includes(articleId)) {
    this.relatedArticles.push(articleId);
  }
  return this.save();
};

// Static method for search
HelpArticleSchema.statics.searchArticles = function (
  query: string,
  filters: any = {},
  options: any = {}
) {
  const searchQuery: any = {
    status: ArticleStatus.PUBLISHED,
    ...filters,
  };

  if (query) {
    searchQuery.$text = { $search: query };
  }

  return this.find(searchQuery)
    .populate("category", "name icon")
    .populate("author", "firstName lastName")
    .sort(
      options.sort || {
        score: { $meta: "textScore" },
        "analytics.viewCount": -1,
      }
    )
    .limit(options.limit || 20)
    .skip(options.skip || 0);
};

export default model<IHelpArticle>("HelpArticle", HelpArticleSchema);
