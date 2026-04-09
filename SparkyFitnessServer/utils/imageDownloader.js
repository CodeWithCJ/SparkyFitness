import axios from 'axios';
import fs from 'fs';
import { promises } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const fsp = { promises }.promises; // Import fs.promises as fsp
const UPLOADS_DIR = path.join(__dirname, '../uploads/exercises'); // Relative to SparkyFitnessServer
/**
 * Ensures the upload directory exists.
 */
async function ensureUploadsDir() {
  try {
    await fsp.mkdir(UPLOADS_DIR, { recursive: true });
  } catch (error) {
    console.error(
      `[imageDownloader] Error ensuring uploads directory exists: ${error.message}`
    );
    throw error;
  }
}
/**
 * Downloads an image from a URL and saves it locally.
 * @param {string} imageUrl - The URL of the image to download.
 * @param {string} exerciseId - The ID of the exercise, used for creating a subdirectory.
 * @returns {Promise<string>} The local path to the downloaded image.
 */
async function downloadImage(imageUrl, exerciseId) {
  await ensureUploadsDir();
  const imageFileName = path.basename(imageUrl);
  const exerciseUploadDir = path.join(UPLOADS_DIR, exerciseId);
  const localImagePath = path.join(exerciseUploadDir, imageFileName);
  try {
    await fsp.mkdir(exerciseUploadDir, { recursive: true });
    const response = await axios({
      method: 'get',
      url: imageUrl,
      responseType: 'stream',
    });
    const writer = fs.createWriteStream(localImagePath);
    response.data.pipe(writer);
    return new Promise((resolve, reject) => {
      writer.on('finish', () =>
        resolve(`/uploads/exercises/${exerciseId}/${imageFileName}`)
      ); // Return web-accessible path
      writer.on('error', reject);
    });
  } catch (error) {
    console.error(
      `[imageDownloader] Error downloading image ${imageUrl}:`,
      error.message
    );
    throw error;
  }
}
export { downloadImage };
export default {
  downloadImage,
};
