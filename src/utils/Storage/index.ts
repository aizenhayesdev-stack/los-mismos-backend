import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import {
  AWS_ACCESS_KEY,
  AWS_REGION,
  AWS_SECRET_ACCESS_KEY,
  S3_BUCKET_NAME,
} from "../../config/environment";

const s3 = new S3Client({
  region: AWS_REGION,
  credentials: {
    accessKeyId: AWS_ACCESS_KEY as string,
    secretAccessKey: AWS_SECRET_ACCESS_KEY as string,
  },
});

export const uploadToS3 = async (
  buffer: Buffer,
  mimetype: string,
  name: string
) => {
  const params = {
    Bucket: S3_BUCKET_NAME,
    Key: `${new Date().toISOString()}-${name}`,
    Body: buffer,
    ContentType: mimetype,
  };
  try {
    await s3.send(new PutObjectCommand(params));
    return `https://${S3_BUCKET_NAME}.s3.${AWS_REGION}.amazonaws.com/${params.Key}`;
  } catch (error) {
    throw error;
  }
};
