import React, { useEffect, useState } from "react";

import { getCustomFontFamilyFromSource } from "../../services/customFonts";

const FONT_ACCEPT = ".woff,.woff2,.ttf,.otf,font/woff,font/woff2,font/ttf,font/otf";

function getDisplayFileName(value = "") {
  if (typeof value !== "string" || !value.startsWith("data:")) {
    return "";
  }

  const header = value.split(",")[0] || "";
  const match = header.match(/;name=([^;]+)/i);

  if (match) {
    return decodeURIComponent(match[1]);
  }

  return getCustomFontFamilyFromSource(value);
}

const FontFileWidget = (props) => {
  const [selectedName, setSelectedName] = useState("");

  useEffect(() => {
    setSelectedName(getDisplayFileName(props.value));
  }, [props.value]);

  const onFileChange = (event) => {
    const nextFile = event.target.files && event.target.files[0];
    if (!nextFile) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const value = reader.result;
      setSelectedName(nextFile.name);
      props.onChange(value);
      setTimeout(() => {
        props.onBlur && props.onBlur(props.id, value);
      }, 100);
    };
    reader.readAsDataURL(nextFile);
  };

  return (
    <div className="mb-0">
      <label className="form-label">{props.label}</label>
      {selectedName ? (
        <div className="mb-2 small text-muted">Aktuelle Datei: {selectedName}</div>
      ) : (
        <div className="mb-2 small text-muted">
          Unterstützt: WOFF2, WOFF, TTF und OTF.
        </div>
      )}
      {!selectedName && (
        <input
          id={props.id}
          type="file"
          className="form-control"
          accept={FONT_ACCEPT}
          onChange={onFileChange}
        />
      )}
      {selectedName && (
        <button
          type="button"
          className="btn btn-outline-secondary btn-sm"
          onClick={() => {
            setSelectedName("");
            props.onChange("");
            setTimeout(() => {
              props.onBlur && props.onBlur(props.id, "");
            }, 100);
          }}
        >
          Schriftdatei ersetzen
        </button>
      )}
    </div>
  );
};

export default FontFileWidget;