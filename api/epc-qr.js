const QRCode = require("qrcode");

const EPC_MAX_BYTES = 331;

// Defaults tuned for banking apps:
const DEFAULT_SIZE = 600;     // px
const DEFAULT_MARGIN = 4;     // quiet zone in modules
const DEFAULT_ECC = "M";      // per EPC guidance
const DEFAULT_VERSION = 6;    // IMPORTANT: avoid RB crash seen with low versions (e.g., v3)

function clampInt(value, min, max, fallback) {
  const n = Number.parseInt(value, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

module.exports = async (req, res) => {
  try {
    const data = req.query?.data;

    if (!data || typeof data !== "string") {
      res.statusCode = 400;
      return res.end("Missing required query parameter: data");
    }

    const epcText = data;
    const bytes = Buffer.from(epcText, "utf8");

    if (bytes.length > EPC_MAX_BYTES) {
      res.statusCode = 400;
      return res.end(`EPC payload too large: ${bytes.length} bytes (max ${EPC_MAX_BYTES})`);
    }

    const size = clampInt(req.query?.size, 200, 1200, DEFAULT_SIZE);
    const margin = clampInt(req.query?.margin, 0, 25, DEFAULT_MARGIN);
    const ecc = (req.query?.ecc || DEFAULT_ECC).toString().toUpperCase();
    const version = clampInt(req.query?.version, 1, 40, DEFAULT_VERSION);

    // Force BYTE mode (avoid alphanumeric optimizations)
    const segments = [{ data: bytes, mode: "byte" }];

    const png = await QRCode.toBuffer(segments, {
      type: "png",
      errorCorrectionLevel: ecc,
      margin,
      width: size,
      version,
      color: {
        dark: "#000000",
        light: "#FFFFFF",
      },
    });

    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "no-store");
    res.statusCode = 200;
    res.end(png);
  } catch (err) {
    res.statusCode = 500;
    res.end(`QR generation failed: ${err?.message || String(err)}`);
  }
};
