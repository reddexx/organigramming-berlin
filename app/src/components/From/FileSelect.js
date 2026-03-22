import SelectWidget from "@rjsf/core/lib/components/widgets/SelectWidget";

import React, { useState, useEffect } from "react";

const FilePreview = (props) => {
  if (!props.value) {
    return <div>No file uploaded.</div>;
  }
  return (
    <div>
      <img
        src={props.value}
        alt="pload Preview"
        style={Object.assign(
          {
            maxHeight: "10rem",
            width: "auto",
            maxWidth: "100%",
            marginBottom: "1rem",
          },
          props.style
        )}
      ></img>
    </div>
  );
};

const FilePreviewWidget = (props) => {
  const [selected, setSelected] = useState(props.value);
  const [file, setFile] = useState(props.value || undefined);
  const preuploads = props.options?.preuploads || props.uiSchema?.preuploads || [];

  const enumOptions = [
    { label: "Datei hochladen", value: "upload" },
    ...preuploads.map((e) => {
      return {
        label: e.filename,
        value: e.filename,
      };
    }),
  ];


  useEffect(() => {
    if (props.value) {
      if (props.value.startsWith("data:")) {
        const splitted = props.value.split(","),
          params = splitted[0].split(";"),
          properties = params.filter(function (param) {
            return param.split("=")[0] === "name";
          });

        let name;
        if (properties.length !== 1) {
          name = "unknown";
        } else {
          name = properties[0].split("=")[1];
        }
        setSelected(name);
      } else {
        const parts = props.value.split("/");
        setSelected(parts[parts.length - 1] || "uploaded-file");
      }
    } else {
      setSelected("");
    }
  }, [props.value]);

  const onSelect = (e) => {
    if (e !== "upload") {
      const _file = preuploads.find((s) => s.filename === e),
        base64String = _file.base64String;

      setSelected(e);
      setFile(base64String);

      props.onChange(base64String);
      setTimeout(() => {
        props.onBlur();
      }, 100);
    } else {
      setSelected("");
    }
  };

  const onFileChange = (event) => {
    const nextFile = event.target.files && event.target.files[0];
    if (!nextFile) return;

    const reader = new FileReader();
    reader.onload = () => {
      const value = reader.result;
      setFile(value);
      setSelected(nextFile.name);
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
      {props.value && <FilePreview key="preview" {...props} />}
      {preuploads.length > 0 && (
        <SelectWidget
          {...props}
          options={{ enumOptions: enumOptions }}
          id={props.id + "-select"}
          schema={{
            ...props.schema,
            default: "none",
          }}
          placeholder="Auswählen"
          onChange={(e) => onSelect(e)}
          multiple={false}
          value={selected}
        />
      )}
      {!selected && (
        <input
          key="file"
          id={props.id}
          type="file"
          className="form-control"
          accept="image/*"
          onChange={onFileChange}
        />
      )}
      {selected && (
        <button
          type="button"
          className="btn btn-outline-secondary btn-sm mt-2"
          onClick={() => {
            setSelected("");
            setFile(undefined);
            props.onChange("");
            setTimeout(() => {
              props.onBlur && props.onBlur(props.id, "");
            }, 100);
          }}
        >
          Datei ersetzen
        </button>
      )}
    </div>
  );
};

export default FilePreviewWidget;
