import React, { useState, useEffect, useRef } from "react";
import { Button, Modal, Row, Col, Alert, Form as BootstrapForm } from "react-bootstrap";
import ObjectFieldTemplate from "../From/ObjectFieldTemplate";

import Form from "@rjsf/bootstrap-4";
import { getDefinitions } from "../../services/getDefinitions";
import ArrayFieldTemplate from "../From/ArrayFieldTemplate";
import FontFileWidget from "../From/FontFileWidget";
import {
  sanitizeCustomFonts,
  getCustomFontFamilyFromSource,
} from "../../services/customFonts";
import { upgradeDataStructure } from "../../services/upgradeDataStructure";
import { validateData } from "../../services/service";

const SettingsModal = (props) => {
  const [formData, setFormData] = useState({ ...props.data });
  const [initialFormData, setInitialFormData] = useState({});
  const [templateImportError, setTemplateImportError] = useState(null);
  const [templateImportSuccess, setTemplateImportSuccess] = useState("");
  const hasMounted = useRef(false);

  const properties = {
    properties: {
      settings: {
        $ref: "#/definitions/settings",
      },
    },
  };
  const definitions = getDefinitions(formData);

  useEffect(() => {
    const nextFormData = { ...props.data };
    setFormData(nextFormData);

    if (props.show || !hasMounted.current) {
      setInitialFormData(nextFormData);
      hasMounted.current = true;
    }
  }, [props.data, props.show]);

  const schema = { ...definitions, ...properties };

  const uiSchema = {
    "ui:headless": true,
    settings: {
      "ui:headless": true,
      "ui:order": [
        "customFonts",
        "roleOptions",
        "departmentOptions",
        "additionalDesignationOptions",
      ],
      validator: {
        "ui:widget": "hidden",
      },
      customFonts: {
        "ui:options": {
          orderable: false,
        },
        items: {
          source: {
            "ui:widget": FontFileWidget,
          },
        },
      },
      roleOptions: {
        "ui:options": {
          orderable: false,
        },
      },
      departmentOptions: {
        "ui:options": {
          orderable: false,
        },
      },
      additionalDesignationOptions: {
        "ui:options": {
          orderable: false,
        },
      },
    },
  };

  const persistSettings = (nextFormData = formData) => {
    props.sendDataUp({
      ...nextFormData,
      settings: {
        ...(nextFormData.settings || {}),
        validator: "",
        customFonts: sanitizeCustomFonts(nextFormData?.settings?.customFonts),
      },
    });
  };

  const onChange = (e) => {
    const nextSettings = e.formData?.settings || {};
    const nextCustomFonts = Array.isArray(nextSettings.customFonts)
      ? nextSettings.customFonts.map((font) => {
          const nextFamily =
            (font?.family || "").trim() ||
            getCustomFontFamilyFromSource(font?.source);
          const nextLabel = (font?.label || "").trim() || nextFamily;

          return {
            ...font,
            family: nextFamily,
            label: nextLabel,
          };
        })
      : [];
    const nextFormData = {
      ...e.formData,
      settings: {
        ...nextSettings,
        validator: "",
        customFonts: nextCustomFonts,
      },
    };
    setFormData(nextFormData);
  };

  const handleTemplateImportChange = (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    setTemplateImportError(null);
    setTemplateImportSuccess("");

    const reader = new FileReader();
    reader.onload = async (loadEvent) => {
      try {
        const rawText = String(loadEvent.target?.result || "");
        const parsedData = upgradeDataStructure(JSON.parse(rawText));
        const [valid, errors] = validateData(parsedData);

        if (!valid) {
          setTemplateImportError((errors || []).map((error) => JSON.stringify(error, null, 2)));
          return;
        }

        const importedTemplate = await props.onImportTemplate?.({
          title: parsedData?.document?.title || file.name.replace(/\.json$/i, ""),
          data: parsedData,
        });

        if (!importedTemplate) {
          setTemplateImportError(["Das Template konnte nicht importiert werden."]);
          return;
        }

        setTemplateImportSuccess(`Template "${importedTemplate.title}" wurde importiert.`);
      } catch (error) {
        setTemplateImportError([error?.message || "Ungültige JSON-Datei."]);
      }
    };

    reader.readAsText(file);
  };

  const resetSetting = () => {
    setFormData(initialFormData);
    props.sendDataUp(initialFormData);
  };

  return (
    <Modal {...props} size="lg" aria-labelledby="contained-modal-title-vcenter">
      <Modal.Header closeButton>
        <Modal.Title id="contained-modal-title-vcenter">
          Einstellungen
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Row>
          <Col className="mb-3">
            <Form
              schema={schema}
              uiSchema={uiSchema}
              formData={formData}
              ObjectFieldTemplate={ObjectFieldTemplate}
              ArrayFieldTemplate={ArrayFieldTemplate}
              onChange={onChange}
              showErrorList={false}
            >
              {" "}
            </Form>
            <p>
              Hier können Sie Vorschlagslisten für Rollen, Abteilungen,
              Zusatzbezeichnungen und importierte Schriftarten verwalten.
            </p>
            <div className="mt-4">
              <h5>Gespeicherte Templates</h5>
              <p>Hier können Sie benutzerdefinierte Templates importieren oder entfernen.</p>
              <BootstrapForm.Group className="mb-3">
                <BootstrapForm.Label>Exportierte JSON als Template importieren</BootstrapForm.Label>
                <BootstrapForm.Control type="file" accept=".json" onChange={handleTemplateImportChange} />
              </BootstrapForm.Group>
              {templateImportSuccess && <Alert variant="success">{templateImportSuccess}</Alert>}
              {templateImportError && (
                <Alert variant="danger">
                  {templateImportError.map((errorMessage, index) => (
                    <pre key={`template-import-error-${index}`} className="mb-0 mt-2">
                      {errorMessage}
                    </pre>
                  ))}
                </Alert>
              )}
              {(props.templates || []).length === 0 ? (
                <p className="text-muted mb-0">Keine gespeicherten Templates vorhanden.</p>
              ) : (
                <div>
                  {(props.templates || []).map((template) => (
                    <div
                      key={template.id}
                      className="d-flex justify-content-between align-items-center border rounded px-3 py-2 mb-2"
                    >
                      <div>
                        <div>{template.title}</div>
                        <small className="text-muted">
                          {template.timestamp
                            ? new Date(template.timestamp).toLocaleString()
                            : ""}
                        </small>
                      </div>
                      <Button
                        variant="outline-danger"
                        size="sm"
                        onClick={() => {
                          if (
                            window.confirm(
                              `Möchten Sie das Template "${template.title}" wirklich entfernen?`
                            )
                          ) {
                            props.onDeleteTemplate && props.onDeleteTemplate(template.id);
                          }
                        }}
                      >
                        Entfernen
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Col>
        </Row>
      </Modal.Body>
      <Modal.Footer>
        <Button
          className="btn btn-danger"
          onClick={() => {
            resetSetting();
            props.onHide();
          }}
        >
          Abbrechen
        </Button>
        <Button
          onClick={() => {
            persistSettings();
            props.onHide();
          }}
        >
          Übernehmen
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

export default SettingsModal;
