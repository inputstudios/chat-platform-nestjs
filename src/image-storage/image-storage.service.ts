import { Inject, Injectable } from "@nestjs/common";
import { Services } from "src/utils/constants";
import { IImageStorageService } from './image-storage';
import { S3 } from '@aws-sdk/client-s3';
import { 
   UploadGroupMessageAttachmentParams,
   UploadImageParams, 
   UploadMessageAttachmentParams, 
} from "src/utils/types";
import { compressImage } from "src/utils/helpers";
import { GroupMessageAttachment } from "src/utils/typeorm";

@Injectable()
export class ImageStorageService implements IImageStorageService {
   constructor(
      @Inject(Services.SPACES_CLIENT)
      private readonly spacesClient: S3,
   ) {}

   upload(params: UploadImageParams) {
      return this.spacesClient.putObject({
         Bucket: 'dialogchat',
         Key: params.key,
         Body: params.file.buffer,
         ACL: 'public-read',
         ContentType: params.file.mimetype,
      });
   }

   async uploadMessageAttachment(params: UploadMessageAttachmentParams) {
      this.spacesClient.putObject({
         Bucket: 'dialogchat',
         Key: `original/${params.messageAttachment.key}`,
         Body: params.file.buffer,
         ACL: 'public-read',
         ContentType: params.file.mimetype,
      });
      await this.spacesClient.putObject({
         Bucket: 'dialogchat',
         Key: `preview/${params.messageAttachment.key}`,
         Body: await compressImage(params.file),
         ACL: 'public-read',
         ContentType: params.file.mimetype,
      });
      return params.messageAttachment;
   }

   async uploadGroupMessageAttachment(
      params: UploadGroupMessageAttachmentParams,
   ): Promise<GroupMessageAttachment> {
      this.spacesClient.putObject({
         Bucket: 'dialogchat',
         Key: `original/${params.messageAttachment.key}`,
         Body: params.file.buffer,
         ACL: 'public-read',
         ContentType: params.file.mimetype,
      });
      await this.spacesClient.putObject({
         Bucket: 'dialogchat',
         Key: `preview/${params.messageAttachment.key}`,
         Body: await compressImage(params.file),
         ACL: 'public-read',
         ContentType: params.file.mimetype,
      });
      return params.messageAttachment;
   }
}
