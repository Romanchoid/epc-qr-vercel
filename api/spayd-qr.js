const QRCode = require("qrcode");

const DEFAULT_SIZE = 260;   // requested
const DEFAULT_MARGIN = 4;
const DEFAULT_ECC = "M";

// Defaults (same as /api/spayd)
const DEFAULT_ACC = "CZ4620100000002300767384"; // 2300767384/2010 -> IBAN
const DEFAULT_AM = "1600";
const DEFAULT_CC = "CZK";
const DEFAULT_MSG = "109-42";

function clampInt(value, min, max, fallback) {
  const n = Number.parseInt(value, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function encodeSpaydValue(v) {
  return encodeURIComponent(String(v)).replace(/\*/g, "%2A");
}

function normalizeAmount(am) {
  let s = String(am).trim();
  s = s.replace(",", ".");
  s = s.replace(/[^0-9.]/g, "");
  const parts = s.split(".");
  if (parts.length > 2) s = parts[0] + "." + parts.slice(1).join("");
  s = s.replace(/^0+(\d)/, "$1");
  return s || DEFAULT_AM;
}

function buildSpayd(query) {
  const acc = (query?.acc || DEFAULT_ACC).toString().trim();
  const am = normalizeAmount(query?.am ?? DEFAULT_AM);
  const cc = (query?.cc || DEFAULT_CC).toString().trim().toUpperCase();
  const msg = (query?.msg || DEFAULT_MSG).toString().trim();

  const fields = [
    "SPD",
    "1.0",
    `ACC:${encodeSpaydValue(acc)}`,
    `AM:${encodeSpaydValue(am)}`,
    `CC:${encodeSpaydValue(cc)}`,
    `MSG:${encodeSpaydValue(msg)}`,
  ];

  return fields.join("*");
}

module.exports = async (req, res) => {
  try {
    const size = clampInt(req.query?.size, 200, 1200, DEFAULT_SIZE);
    const margin = clampInt(req.query?.margin, 0, 25, DEFAULT_MARGIN);
    const ecc = (req.query?.ecc || DEFAULT_ECC).toString().toUpperCase();

    const spayd = buildSpayd(req.query);
    const bytes = Buffer.from(spayd, "utf8");

    // Force BYTE mode
    const segments = [{ data: bytes, mode: "byte" }];

    const png = await QRCode.toBuffer(segments, {
      type: "png",
      errorCorrectionLevel: ecc,
      margin,
      width: size,
      color: { dark: "#000000", light: "#FFFFFF" },
    });

    res.statusCode = 200;
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "no-store");
    res.end(png);
  } catch (err) {
    res.statusCode = 500;
    res.end(`QR generation failed: ${err?.message || String(err)}`);
  }
};
