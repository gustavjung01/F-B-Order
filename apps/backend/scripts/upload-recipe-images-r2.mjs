import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = path.resolve(import.meta.dirname, "../../..");
const mapPath = path.join(root, "data/recipes/bepsi-recipes-v1/image-map.json");
const imageDir = process.env.RECIPE_IMAGE_DIR || "F:/1_A_Disk_D/khuong-binh/bep-si/image/recipes";
const accountId = process.env.R2_ACCOUNT_ID || process.env.CLOUDFLARE_ACCOUNT_ID;
const bucket = process.env.R2_BUCKET_NAME || process.env.CATALOG_R2_BUCKET || process.env.R2_BUCKET;
const accessKey = process.env.R2_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID;
const secret = process.env.R2_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY;
const publicBase = (process.env.R2_PUBLIC_BASE_URL || "").replace(/\/+$/, "");
if (!accountId || !bucket || !accessKey || !secret || !publicBase) throw new Error("Missing R2 configuration");

const enc = (v) => encodeURIComponent(v).replace(/[!'()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
const hmac = (k,v) => crypto.createHmac("sha256",k).update(v).digest();
const sha = (v) => crypto.createHash("sha256").update(v).digest("hex");
function presign(key, contentType) {
  const host = `${accountId}.r2.cloudflarestorage.com`;
  const uri = `/${enc(bucket)}/${key.split("/").map(enc).join("/")}`;
  const now = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
  const day = now.slice(0,8), scope = `${day}/auto/s3/aws4_request`;
  const signed = "content-type;host";
  const params = [
    ["X-Amz-Algorithm","AWS4-HMAC-SHA256"],
    ["X-Amz-Content-Sha256","UNSIGNED-PAYLOAD"],
    ["X-Amz-Credential",`${accessKey}/${scope}`],
    ["X-Amz-Date",now],["X-Amz-Expires","900"],["X-Amz-SignedHeaders",signed],
  ].map(([k,v])=>`${enc(k)}=${enc(v)}`).sort().join("&");
  const canonical = ["PUT",uri,params,`content-type:${contentType}\nhost:${host}\n`,signed,"UNSIGNED-PAYLOAD"].join("\n");
  const toSign = ["AWS4-HMAC-SHA256",now,scope,sha(canonical)].join("\n");
  const keyDate=hmac(`AWS4${secret}`,day), keyRegion=hmac(keyDate,"auto"), keyService=hmac(keyRegion,"s3"), signing=hmac(keyService,"aws4_request");
  const sig=crypto.createHmac("sha256",signing).update(toSign).digest("hex");
  return `https://${host}${uri}?${params}&X-Amz-Signature=${sig}`;
}

const manifest = JSON.parse(await fs.readFile(mapPath,"utf8"));
for (const entry of manifest.entries) {
  if (!entry.fileName) continue;
  const filePath = path.join(imageDir, entry.fileName);
  const body = await fs.readFile(filePath);
  const type = entry.fileName.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
  const response = await fetch(presign(entry.objectKey,type), { method:"PUT", headers:{"content-type":type}, body });
  if (!response.ok) throw new Error(`Upload failed ${entry.fileName}: ${response.status}`);
  entry.publicUrl = `${publicBase}/${entry.objectKey.split("/").map(enc).join("/")}`;
  entry.status = "uploaded";
  console.log(`uploaded ${entry.fileName}`);
}
await fs.writeFile(mapPath, JSON.stringify(manifest,null,2)+"\n");
console.log(`updated ${mapPath}`);
