import { PDFDocument } from "pdf-lib";
import Busboy from "busboy";

export const config = {
  api: { bodyParser: false },
};

const REQUIRED_KEY = process.env.REQUIRED_KEY;

function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const bb = Busboy({ headers: req.headers });
    const fields = {};
    const files = {};

    bb.on("field", (name, val) => {
      fields[name] = val;
    });

    bb.on("file", (name, file, info) => {
      const chunks = [];
      file.on("data", (d) => chunks.push(d));
      file.on("end", () => {
        files[name] = {
          filename: info.filename,
          mimeType: info.mimeType,
          buffer: Buffer.concat(chunks),
        };
      });
    });

    bb.on("error", reject);
    bb.on("finish", () => resolve({ fields, files }));

    req.pipe(bb);
  });
}

export default async function handler(req, res) {
  try {
    // Fail-closed auth
    const apiKey = req.headers["x-api-key"];
    if (!REQUIRED_KEY || apiKey !== REQUIRED_KEY) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const { fields, files } = await parseMultipart(req);

    if (!files.pdf?.buffer) {
      return res.status(400).json({ error: "Missing file field 'pdf'." });
    }
    if (!files.png?.buffer) {
      return res.status(400).json({ error: "Missing file field 'png'." });
    }

    // Params (defaults): x,y are margins from the chosen anchor corner
    const anchor = (fields.anchor ?? "bottom-right").toLowerCase();
    const x = Number(fields.x ?? "25");
    const y = Number(fields.y ?? "25");
    const w = Number(fields.w ?? "120");
    const opacity = Number(fields.opacity ?? "1");

    // Load PDF
    const pdfDoc = await PDFDocument.load(files.pdf.buffer);

    const pages = pdfDoc.getPages();
    if (!pages.length) {
      return res.status(400).json({ error: "PDF has no pages." });
    }
    const page = pages[0]; // ALWAYS page 1

    // Embed PNG
    const pngImage = await pdfDoc.embedPng(files.png.buffer);
    const pngDims = pngImage.scale(1);

    // Keep aspect ratio: compute height from width
    const h = (pngDims.height / pngDims.width) * w;

    const { width: pageW, height: pageH } = page.getSize();

    let drawX;
    let drawY;

    if (anchor === "bottom-right") {
      drawX = pageW - x - w;
      drawY = y;
    } else if (anchor === "bottom-left") {
      drawX = x;
      drawY = y;
    } else if (anchor === "top-right") {
      drawX = pageW - x - w;
      drawY = pageH - y - h;
    } else if (anchor === "top-left") {
      drawX = x;
      drawY = pageH - y - h;
    } else {
      return res.status(400).json({
        error: "Invalid anchor. Use bottom-right, bottom-left, top-right, top-left.",
      });
    }

    page.drawImage(pngImage, {
      x: drawX,
      y: drawY,
      width: w,
      height: h,
      opacity,
    });

    const outPdfBytes = await pdfDoc.save();

    res.setHeader("Content-Type", "application/pdf");
    return res.status(200).send(Buffer.from(outPdfBytes));
  } catch (err) {
    return res.status(500).json({
      error: "Merge failed",
      details: err?.message ?? String(err),
    });
  }
}
