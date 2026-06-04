import { ModuleProvider, Modules } from "@medusajs/framework/utils"
import { CloudinaryFileService } from "./services/cloudinary-file"

export default ModuleProvider(Modules.FILE, {
  services: [CloudinaryFileService],
})
