import Form from "@rjsf/bootstrap-4";
import React, { useState, useRef } from "react";
import { Form as BootstrapForm } from "react-bootstrap";
import FileSelect from "../From/FileSelect";
import ObjectFieldTemplate from "../From/ObjectFieldTemplate";
import MDEditorWidget from "../From/MDEditor";
import { getDefinitions } from "../../services/getDefinitions";
import UriSearch from "../From/UriSearch";

const importAll = (r) => {
  let images = [];
  r.keys().map((item) => {
    const arrayBuffer = new Uint8Array(r(item)),
      fileName = item.replace("./", ""),
      extension = fileName.split(".").pop();
    let type;
    switch (extension) {
      case "svg":
        type = "image/svg+xml";
        break;
      default:
        type = "image/jpeg";
        break;
    }
    const base64String =
      "data:" +
      type +
      ";name=" +
      fileName +
      ";base64," +
      btoa(
        new Uint8Array(arrayBuffer).reduce(
          (data, byte) => data + String.fromCharCode(byte),
          ""
        )
      );

    images.push({
      filename: fileName,
      extension: extension,
      base64String: base64String,
    });

    return item;
  });
  return images;
};

const preuploads = importAll(
  require.context("../../assets/logos/", false, /\.(png|jpe?g|svg)$/)
);

const DocumentTab = ({ data, sendDataUp }) => {
  const [formData, setFormData] = useState({ ...data });
  const definitions = getDefinitions(data);

  const timerRef = useRef(null);

  const properties = {
    properties: {
      document: {
        $ref: "#/definitions/document",
      },
    },
  };

  const schema = { ...definitions, ...properties };

  const uiSchema = {
    "ui:headless": true,
    document: {
      "ui:headless": true,
      note: {
        title: "Fußzeile",
        "ui:widget": MDEditorWidget,
      },
      logo: {
        "ui:widget": FileSelect,
        preuploads: preuploads,
      },
      version: {
        "ui:options": {
          format: "DMY",
        },
      },
      schemaVersion: {
        "ui:widget": "hidden",
      },
      isMainChart: {
        "ui:widget": "hidden",
      },
      paperOrientation: {
        "ui:widget": "radio",
        "ui:options": {
          inline: true,
        },
      },
      layoutMode: {
        "ui:widget": "radio",
        "ui:options": {
          inline: true,
        },
      },
      freeConnections: {
        "ui:widget": "hidden",
      },
      uri: {
        "ui:headless": true,
        "ui:field": "UriSearch",
      },
    },
  };

  const fields = {
    UriSearch: UriSearch,
  };

  const handleSendDataUp = (data) => {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      sendDataUp(data);
    }, 200);
  };

  const onChange = async (e) => {
    setFormData({ ...e.formData });
    handleSendDataUp({ ...e.formData });
  };

  const onToggleMainChart = (e) => {
    const nextFormData = {
      ...formData,
      document: {
        ...formData.document,
        isMainChart: e.target.checked,
      },
    };
    setFormData(nextFormData);
    handleSendDataUp(nextFormData);
  };

  // const onBlur = () => {
  //   sendDataUp(formData);
  // };
  // const onChange = (e) => {
  //   setFormData(e.formData);
  // };

  return (
    <div className="tab p-0 container-fluid">
      <div className="px-3 pt-3">
        <h2>Dokument</h2>
        <BootstrapForm.Check
          type="switch"
          id="default-organigram-switch"
          label="Standard Organigramm"
          checked={Boolean(formData?.document?.isMainChart)}
          onChange={onToggleMainChart}
          className="mb-3"
        />
      </div>
      <Form
        schema={schema}
        uiSchema={uiSchema}
        formData={formData}
        ObjectFieldTemplate={ObjectFieldTemplate}
        onChange={onChange}
        // onBlur={onBlur}
        liveValidate
        showErrorList={false}
        fields={fields}
      >
        <br />
      </Form>
    </div>
  );
};

export default DocumentTab;
