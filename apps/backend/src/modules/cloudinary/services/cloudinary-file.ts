import {
  AbstractFileProviderService,
  MedusaError,
} from "@medusajs/framework/utils"
import { FileTypes, Logger } from "@medusajs/framework/types"
import { v2 as cloudinary } from "cloudinary"
import { Readable, PassThrough, Writable } from "stream"
import path from "path"

type InjectedDependencies = {
  logger: Logger
}

export type CloudinaryFileServiceOptions = {
  cloud_name: string
  api_key: string
  api_secret: string
  /** Optional folder prefix for all uploaded assets (e.g. "medusa/products") */
  folder?: string
}

export class CloudinaryFileService extends AbstractFileProviderService {
  static identifier = "cloudinary"

  protected logger_: Logger
  protected config_: Required<CloudinaryFileServiceOptions>

  constructor(
    { logger }: InjectedDependencies,
    options: CloudinaryFileServiceOptions
  ) {
    super()
    this.logger_ = logger
    this.config_ = {
      cloud_name: options.cloud_name,
      api_key: options.api_key,
      api_secret: options.api_secret,
      folder: options.folder ?? "medusa",
    }

    cloudinary.config({
      cloud_name: this.config_.cloud_name,
      api_key: this.config_.api_key,
      api_secret: this.config_.api_secret,
      secure: true,
    })
  }

  /**
   * Upload a file to Cloudinary.
   * Medusa passes file content as a base64 string or UTF-8 string.
   */
  async upload(
    file: FileTypes.ProviderUploadFileDTO
  ): Promise<FileTypes.ProviderFileResultDTO> {
    if (!file) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "No file provided"
      )
    }
    if (!file.filename) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "No filename provided"
      )
    }

    const parsedFilename = path.parse(file.filename)
    const publicId = `${this.config_.folder}/${parsedFilename.name}`

    // Determine if content is base64 or plain text
    const isBase64 = this.isBase64(file.content)
    const dataUri = isBase64
      ? `data:${file.mimeType ?? "application/octet-stream"};base64,${file.content}`
      : `data:${file.mimeType ?? "application/octet-stream"};base64,${Buffer.from(file.content, "utf8").toString("base64")}`

    try {
      const result = await cloudinary.uploader.upload(dataUri, {
        public_id: publicId,
        resource_type: "auto",
        type: file.access === "private" ? "authenticated" : "upload",
        overwrite: false,
        unique_filename: true,
        use_filename: true,
      })

      return {
        url: result.secure_url,
        key: result.public_id,
      }
    } catch (error) {
      this.logger_.error(`Cloudinary upload failed: ${error.message}`)
      throw error
    }
  }

  /**
   * Stream upload support — returns a PassThrough stream that buffers
   * and uploads to Cloudinary when the stream ends.
   */
  async getUploadStream(fileData: FileTypes.ProviderUploadStreamDTO): Promise<{
    writeStream: Writable
    promise: Promise<FileTypes.ProviderFileResultDTO>
    url: string
    fileKey: string
  }> {
    if (!fileData.filename) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "No filename provided"
      )
    }

    const parsedFilename = path.parse(fileData.filename)
    const publicId = `${this.config_.folder}/${parsedFilename.name}-${Date.now()}`

    const pass = new PassThrough()
    const chunks: Buffer[] = []

    pass.on("data", (chunk: Buffer) => chunks.push(chunk))

    const promise = new Promise<FileTypes.ProviderFileResultDTO>(
      (resolve, reject) => {
        pass.on("end", async () => {
          try {
            const buffer = Buffer.concat(chunks)
            const dataUri = `data:${fileData.mimeType ?? "application/octet-stream"};base64,${buffer.toString("base64")}`

            const result = await cloudinary.uploader.upload(dataUri, {
              public_id: publicId,
              resource_type: "auto",
              type: fileData.access === "private" ? "authenticated" : "upload",
              overwrite: false,
              unique_filename: true,
              use_filename: true,
            })

            resolve({ url: result.secure_url, key: result.public_id })
          } catch (error) {
            reject(error)
          }
        })
        pass.on("error", reject)
      }
    )

    // Placeholder URL — resolved in `promise`
    const placeholderUrl = `https://res.cloudinary.com/${this.config_.cloud_name}/image/upload/${publicId}`

    return {
      writeStream: pass,
      promise,
      url: placeholderUrl,
      fileKey: publicId,
    }
  }

  /**
   * Delete one or more files from Cloudinary by their public_id (key).
   */
  async delete(
    files:
      | FileTypes.ProviderDeleteFileDTO
      | FileTypes.ProviderDeleteFileDTO[]
  ): Promise<void> {
    const fileList = Array.isArray(files) ? files : [files]

    try {
      await Promise.all(
        fileList.map((file) =>
          cloudinary.uploader.destroy(file.fileKey, {
            resource_type: "image",
            invalidate: true,
          })
        )
      )
    } catch (error) {
      this.logger_.error(`Cloudinary delete failed: ${error.message}`)
    }
  }

  /**
   * Generate a signed URL for temporary private file access.
   */
  async getPresignedDownloadUrl(
    fileData: FileTypes.ProviderGetFileDTO
  ): Promise<string> {
    // Generate a signed URL valid for 1 hour
    const signedUrl = cloudinary.url(fileData.fileKey, {
      resource_type: "auto",
      type: "authenticated",
      sign_url: true,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      secure: true,
    })

    return signedUrl
  }

  /**
   * Generate a presigned upload URL (Cloudinary upload widget / direct upload).
   */
  async getPresignedUploadUrl(
    fileData: FileTypes.ProviderGetPresignedUploadUrlDTO
  ): Promise<FileTypes.ProviderFileResultDTO> {
    if (!fileData?.filename) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "No filename provided"
      )
    }

    const parsedFilename = path.parse(fileData.filename)
    const publicId = `${this.config_.folder}/${parsedFilename.name}`
    const expiresAt = Math.floor(Date.now() / 1000) + (fileData.expiresIn ?? 3600)

    const signature = cloudinary.utils.api_sign_request(
      {
        timestamp: expiresAt,
        public_id: publicId,
        upload_preset: undefined,
      },
      this.config_.api_secret
    )

    const uploadUrl =
      `https://api.cloudinary.com/v1_1/${this.config_.cloud_name}/auto/upload` +
      `?api_key=${this.config_.api_key}` +
      `&timestamp=${expiresAt}` +
      `&public_id=${encodeURIComponent(publicId)}` +
      `&signature=${signature}`

    return {
      url: uploadUrl,
      key: publicId,
    }
  }

  /**
   * Stream download of a Cloudinary asset.
   */
  async getDownloadStream(
    file: FileTypes.ProviderGetFileDTO
  ): Promise<Readable> {
    const url = cloudinary.url(file.fileKey, {
      resource_type: "auto",
      type: "authenticated",
      sign_url: true,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      secure: true,
    })

    const response = await fetch(url)
    if (!response.ok || !response.body) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        `Failed to download file from Cloudinary: ${file.fileKey}`
      )
    }

    return Readable.fromWeb(response.body as any)
  }

  /**
   * Download a Cloudinary asset as a Buffer.
   */
  async getAsBuffer(file: FileTypes.ProviderGetFileDTO): Promise<Buffer> {
    const url = cloudinary.url(file.fileKey, {
      resource_type: "auto",
      type: "authenticated",
      sign_url: true,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      secure: true,
    })

    const response = await fetch(url)
    if (!response.ok) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        `Failed to download file from Cloudinary: ${file.fileKey}`
      )
    }

    const arrayBuffer = await response.arrayBuffer()
    return Buffer.from(arrayBuffer)
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private isBase64(str: string): boolean {
    try {
      return Buffer.from(str, "base64").toString("base64") === str
    } catch {
      return false
    }
  }
}
