import React, { useState, useEffect, useRef } from "react";
import { Button, Modal, Row, Col } from "react-bootstrap";
import ObjectFieldTemplate from "../From/ObjectFieldTemplate";

import { validationRules } from "../../validation/validationRules";

import Form from "@rjsf/bootstrap-4";
import { getDefinitions } from "../../services/getDefinitions";
import ArrayFieldTemplate from "../From/ArrayFieldTemplate";
import FontFileWidget from "../From/FontFileWidget";
import {
  sanitizeCustomFonts,
  getCustomFontFamilyFromSource,
} from "../../services/customFonts";

const SettingsModal = (props) => {
  const [formData, setFormData] = useState({ ...props.data });
  const [warningMessages, setWarningMessages] = useState([]);

  const [initialFormData, setInitialFormData] = useState({});
  const hasMounted = useRef(false);

  function getErrorMsg(d) {
    const validator = d?.settings?.validator;
    if (!validator) return;
    let rules = validationRules[validator];
    let warningMessages = [];
    for (const key in rules) {
      warningMessages.push(rules[key].warning);
    }
    return warningMessages;
  }
  const properties = {
    properties: {
      settings: {
        $ref: "#/definitions/settings",
      },
    },
  };
  const definitions = getDefinitions(formData);

  useEffect(() => {
    const warningMessages = getErrorMsg(props.data);
    setWarningMessages(warningMessages);

    if (!hasMounted.current) {
      // This block will only run once
      setInitialFormData({ ...props.data });
      hasMounted.current = true;
    }
  }, [props.data]); // Adding props.data to satisfy the linter

  const schema = { ...definitions, ...properties };

  const uiSchema = {
    "ui:headless": true,
    settings: {
      "ui:headless": true,
      "ui:order": [
        "validator",
        "customFonts",
        "roleOptions",
        "departmentOptions",
        "additionalDesignationOptions",
      ],
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

  const onBlur = () => {
    props.sendDataUp({
      ...formData,
      settings: {
        ...(formData.settings || {}),
        customFonts: sanitizeCustomFonts(formData?.settings?.customFonts),
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
        customFonts: nextCustomFonts,
      },
    };
    const warningMessages = getErrorMsg(nextFormData);
    setWarningMessages(warningMessages);

    setFormData(nextFormData);
  };

  const resetSetting = () => {
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
              onBlur={onBlur}
              liveValidate
              showErrorList={false}
            >
              {" "}
            </Form>
            <p>
              Hier können Sie Validierung sowie Vorschlagslisten für Rollen,
              Abteilungen, Zusatzbezeichnungen und importierte Schriftarten
              verwalten.
            </p>
            {warningMessages && warningMessages?.length !== 0 && (
              <>
                <p>Für die ausgewählte Validirung gelten folgende Regeln:</p>
                <ul>
                  {warningMessages &&
                    warningMessages.map((errorMsg, i) => (
                      <li key={"warningkey-" + i}>{errorMsg}</li>
                    ))}
                </ul>
              </>
            )}
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
