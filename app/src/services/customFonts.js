const FONT_FILE_EXTENSION_FORMATS = {
  woff2: "woff2",
  woff: "woff",
  ttf: "truetype",
  otf: "opentype",
};

const FONT_MIME_FORMATS = {
  "font/woff2": "woff2",
  "font/woff": "woff",
  "font/ttf": "truetype",
  "font/otf": "opentype",
  "application/font-woff": "woff",
  "application/x-font-woff": "woff",
  "application/x-font-ttf": "truetype",
  "application/x-font-opentype": "opentype",
};

function extractFileNameFromDataUrl(dataUrl = "") {
  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:")) {
    return "";
  }

  const header = dataUrl.split(",")[0] || "";
  const match = header.match(/;name=([^;]+)/i);

  return match ? decodeURIComponent(match[1]) : "";
}

function stripFileExtension(value = "") {
  return value.replace(/\.[^.]+$/, "").trim();
}

function fallbackFontFamily(entry = {}) {
  const label = typeof entry.label === "string" ? entry.label.trim() : "";
  const fileName = stripFileExtension(extractFileNameFromDataUrl(entry.source));

  return label || fileName;
}

export function sanitizeCustomFonts(customFonts = []) {
  if (!Array.isArray(customFonts)) {
    return [];
  }

  return customFonts
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }

      const source = typeof entry.source === "string" ? entry.source : "";
      const label = typeof entry.label === "string" ? entry.label.trim() : "";
      const family = typeof entry.family === "string" ? entry.family.trim() : "";
      const resolvedFamily = family || fallbackFontFamily({ label, source });
      const resolvedLabel = label || resolvedFamily;

      if (!source || !resolvedFamily) {
        return null;
      }

      return {
        label: resolvedLabel,
        family: resolvedFamily,
        source,
      };
    })
    .filter(Boolean)
    .filter(
      (entry, index, entries) =>
        entries.findIndex((candidate) => candidate.family === entry.family) === index
    );
}

export function getCustomFontOptions(customFonts = []) {
  const fonts = sanitizeCustomFonts(customFonts);

  return fonts.map((font) => ({
    value: font.family,
    label: font.label,
  }));
}

function detectFontFormat(font = {}) {
  const header = typeof font.source === "string" ? font.source.split(",")[0] || "" : "";
  const mimeMatch = header.match(/^data:([^;]+)/i);
  const fileName = extractFileNameFromDataUrl(font.source).toLowerCase();
  const extensionMatch = fileName.match(/\.([^.]+)$/);

  if (mimeMatch && FONT_MIME_FORMATS[mimeMatch[1].toLowerCase()]) {
    return FONT_MIME_FORMATS[mimeMatch[1].toLowerCase()];
  }

  if (extensionMatch && FONT_FILE_EXTENSION_FORMATS[extensionMatch[1]]) {
    return FONT_FILE_EXTENSION_FORMATS[extensionMatch[1]];
  }

  return "";
}

export function buildCustomFontFaceCss(customFonts = []) {
  return sanitizeCustomFonts(customFonts)
    .map((font) => {
      const format = detectFontFormat(font);
      const src = format
        ? `url(${JSON.stringify(font.source)}) format(${JSON.stringify(format)})`
        : `url(${JSON.stringify(font.source)})`;

      return `@font-face { font-family: ${JSON.stringify(
        font.family
      )}; src: ${src}; font-display: swap; }`;
    })
    .join("\n");
}

export function getCustomFontFamilyFromSource(source = "") {
  return fallbackFontFamily({ source });
}