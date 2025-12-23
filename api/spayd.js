// Returns a SPAYD (SPD*1.0...) string as text/plain
// Spec: values are percent-encoded; separator is '*'

const DEFAULT_ACC = "CZ4620100000002300767384"; // 2300767384/2010 -> IBAN
const DEFAULT_AM = "1600";
const DEFAULT_CC = "CZK";
const DEFAULT_MSG = "109-42";

function encodeSpaydValue(v) {
  // SPAYD uses '*' as separator; values must not contain raw '*'
  // encodeURIComponent is a safe practical choice for bank apps.
  return encodeURIComponent(String(v)).replace(/\*/g, "%2A");
}

function normalizeAmount(am) {
  // Accept "1600", "1600.5", "1600,50" → output with dot.
  let s = String(am).trim();
  s = s.replace(",", ".");
  s = s.replace(/[^0-9.]/g, "");
  const parts = s.split(".");
  if (parts.length > 2) s = parts[0] + "." + parts.slice(1).join("");
  s = s.replace(/^0+(\d)/, "$1");
  return s || DEFAULT_AM;
}

module.exports = async (req, res) => {
  const REQUIRED_KEY = process.env.QR_API_KEY;
  const apiKey = req.query?.key || req.headers["x-api-key"]; 
  if (REQUIRED_KEY && apiKey !== REQUIRED_KEY) {
    res.statusCode = 401;
    return res.end("Unauthorized");
  }

  try {
    const acc = (req.query?.acc || DEFAULT_ACC).toString().trim();
    const am = normalizeAmount(req.query?.am ?? DEFAULT_AM);
    const cc = (req.query?.cc || DEFAULT_CC).toString().trim().toUpperCase();
    const msg = (req.query?.msg || DEFAULT_MSG).toString().trim();

    const fields = [
      "SPD",
      "1.0",
      `ACC:${encodeSpaydValue(acc)}`,
      `AM:${encodeSpaydValue(am)}`,
      `CC:${encodeSpaydValue(cc)}`,
      `MSG:${encodeSpaydValue(msg)}`,
    ];

    const spayd = fields.join("*");

    res.statusCode = 200;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.end(spayd);
  } catch (err) {
    res.statusCode = 500;
    res.end(`SPAYD generation failed: ${err?.message || String(err)}`);
  }
};
