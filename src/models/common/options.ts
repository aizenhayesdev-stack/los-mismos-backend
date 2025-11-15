export const commonOptions = {
  timestamps: true,
  toJSON: {
    virtuals: true,
    transform(doc: any, ret: any) {
      delete ret.__v;
      // hide sensitive fields by convention (password, etc) if present
      if (ret.password) delete ret.password;
      return ret;
    }
  }
};