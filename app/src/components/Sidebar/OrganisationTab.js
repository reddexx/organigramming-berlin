import React, { useState, useEffect, useRef } from "react";
import FileSelect from "../From/FileSelect";
import { Button, Stack } from "react-bootstrap";
import Form from "@rjsf/bootstrap-4";
import AlertModal from "./AlertModal";
import getURI from "../../services/getURI";
import JSONDigger from "../../services/jsonDigger";
import createExampleOrganisation from "../../services/createExampleOrganisation";

import ArrayFieldTemplate from "../From/ArrayFieldTemplate";
import ObjectFieldTemplate from "../From/ObjectFieldTemplate";
import CollapsibleField from "../From/CollapsibleField";
import UriSearch from "../From/UriSearch";
import ColorPickerWidget from "../From/ColorPickerWidget";

import CustomDropdown from "../From/CustomDropdown";

import { checkErrors } from "../../services/checkErrors";

import { getDefinitions } from "../../services/getDefinitions";
import {
  collectSubtreeNodeIds,
  removeConnectionsForNodeIds,
} from "../../services/freeLayout";

const OrganisationTab = ({ sendDataUp, selected, setSelected, dsDigger, sharedCharts = [] }) => {
  const [formData, setFormData] = useState({ current: selected });
  const [idPrefix, setIdPrefix] = useState("root");
  const [removeNodeAlertModalShow, setRemoveNodeAlertModalShow] =
    useState(false);
  // const dsDigger = new JSONDigger(data, "id", "organisations");
  const timerRef = useRef(null);
  const dsDiggerRef = useRef(dsDigger);
  const isFreeLayout = dsDigger?.ds?.document?.layoutMode === "free";

  const createDigger = () => {
    return new JSONDigger(
      JSON.parse(JSON.stringify(dsDiggerRef.current?.ds || {})),
      "id",
      "organisations"
    );
  };

  // build schema dynamic enum values for linkedChartId
  const linkedEnum = [""];
  const linkedEnumNames = ["Keine"];
  (sharedCharts || []).forEach((s) => {
    linkedEnum.push(s.id);
    linkedEnumNames.push(s.title || s.id);
  });

  const fields = {
    CollapsibleField: CollapsibleField,
    ArrayFieldTemplate: ArrayFieldTemplate,
    UriSearch: UriSearch,
    CustomDropdown: CustomDropdown,
  };

  const definitions = getDefinitions(dsDigger?.ds);
  definitions.definitions.organisation.properties.linkedChartId = {
    ...(definitions.definitions.organisation.properties.linkedChartId || {}),
    type: "string",
    title: "Verlinktes / verknüpftes Organigramm",
    enum: linkedEnum,
    enumNames: linkedEnumNames,
    default: "",
  };

  const schema = {
    ...definitions,
    properties: {
      current: {
        $ref: "#/definitions/organisation",
      },
    },
  };
  const uiSchema = {
    "ui:headless": true,
    current: {
      "ui:headless": true,
      id: {
        "ui:widget": "hidden",
      },
      type: {
        "ui:placeholder": "Auswählen o. eingeben z.B. 'Unternehmensbereich'",
        "ui:field": CustomDropdown,
      },
      purpose: {
        "ui:placeholder": "Auswählen o. eingeben",
        "ui:field": CustomDropdown,
      },
      purposeTextAlign: {
        "ui:widget": "radio",
        "ui:options": {
          inline: true,
        },
      },
      isMainOrganisation: {
        "ui:widget": "hidden",
      },
      relationship: {
        "ui:widget": "hidden",
      },
      positions: {
        "ui:headless": true,
        items: {
          "ui:field": "CollapsibleField",
          collapse: {
            field: "ObjectField",
          },
          uri: {
            "ui:headless": true,
            "ui:field": "UriSearch",
          },
          positionType: {
            "ui:placeholder": "z.B. Geschäftsführung",
            "ui:field": CustomDropdown,
          },
          positionStatus: {
            "ui:placeholder": "z.B. kommissarisch",
            "ui:field": CustomDropdown,
          },
          person: {
            // "ui:headless": true,
            // add a title to the person field
            uri: {
              "ui:headless": true,
              "ui:field": "UriSearch",
            },
          },
        },
      },
      contact: {
        "ui:headless": true,
        "ui:field": "CollapsibleField",
        collapse: {
          field: "ObjectField",
        },
      },
      uri: {
        "ui:headless": true,
        "ui:field": "UriSearch",
      },
      address: {
        "ui:headless": true,
        "ui:field": "CollapsibleField",
        collapse: {
          field: "ObjectField",
        },
      },
      layout: {
        "ui:headless": true,
        "ui:field": "CollapsibleField",
        collapse: {
          field: "ObjectField",
        },
        style: {
          title: "Stil",
        },
        bgColor: {
          "ui:widget": ColorPickerWidget,
          colors: [
            "#c41b31",
            "#bdcde7",
            "#7694ce",
            "#324fa3",
            "#b5d4b7",
            "#67b18d",
            "#357a5d",
            "#0e4c38",
            "#db9f29",
            "#e5bbd0",
            "#988bc2",
            "#00b140",
            "#97d700",
            "#c4d600",
            "#333333",
            "#666666",
            "#999999",
            "#cccccc",
            "#e6e6e6",
            "#f2f2f2",
          ],
        },
        bgStyle: {
          "ui:disabled": !formData.current?.layout?.bgColor,
          "ui:widget": "select",
          "ui:placeholder": "Hintergrundstil auswählen",
          "ui:help": formData.current?.layout?.bgColor
            ? "Wählen Sie aus, wie die Hintergrundfarbe auf der Box dargestellt werden soll."
            : "Hintergrundstil wird erst aktiv, wenn eine Hintergrundfarbe gesetzt ist.",
        },
        nodeWidth: {
          "ui:widget": "range",
          "ui:help": "Breite der Box in Pixeln",
        },
        nodeMinHeight: {
          "ui:widget": "range",
          "ui:help": "Minimale Höhe der Box in Pixeln, 0 = automatisch",
        },
        positionMode: {
          "ui:widget": isFreeLayout ? "hidden" : "radio",
          ...(isFreeLayout
            ? {}
            : {
                "ui:options": {
                  inline: true,
                },
              }),
        },
        purposeTextAlign: {
          "ui:widget": "hidden",
        },
        x: {
          "ui:widget": "hidden",
        },
        y: {
          "ui:widget": "hidden",
        },
        connectorParentAnchor: {
          "ui:widget": "hidden",
        },
        connectorChildAnchor: {
          "ui:widget": "hidden",
        },
        connectorHidden: {
          "ui:widget": "hidden",
        },
      },
      organisations: {
        "ui:headless": true,
        "ui:widget": "hidden",
      },
      linkedChartId: {
        "ui:placeholder": "Auswählen...",
      },
      avatar: {
        "ui:widget": FileSelect,
        preuploads: [],
      },
      departments: {
        items: {
          "ui:headless": true,
          purpose: {
            "ui:placeholder": "Auswählen o. eingeben",
            "ui:field": CustomDropdown,
          },
          type: {
            "ui:placeholder": "z.B. Unternehmensbereich",
            "ui:field": CustomDropdown,
          },
          uri: {
            "ui:headless": true,
            "ui:field": "UriSearch",
          },
          positions: {
            "ui:headless": true,
            items: {
              "ui:field": "CollapsibleField",
              collapse: {
                field: "ObjectField",
              },
              positionType: {
                "ui:placeholder": "z.B. Geschäftsführung",
                "ui:field": CustomDropdown,
              },
              positionStatus: {
                "ui:placeholder": "z.B. kommissarisch",
                "ui:field": CustomDropdown,
              },
              uri: {
                "ui:headless": true,
                "ui:field": "UriSearch",
              },
              person: {
                // "ui:headless": true,
                uri: {
                  "ui:headless": true,
                  "ui:field": "UriSearch",
                },
              },
            },
          },
        },
      },
      suborganizationOrientation: {
        "ui:widget": "radio",
        "ui:options": {
          inline: true,
        },
      },
    },
  };

  useEffect(() => {
    dsDiggerRef.current = dsDigger;
  }, [dsDigger]);

  useEffect(() => {
    if (selected != null) {
      setFormData({ current: { ...selected } });
      setIdPrefix(selected.id);
    } else {
      setFormData({ current: null });
      setIdPrefix("root");
    }
  }, [selected]);

  useEffect(() => {
    clearTimeout(timerRef.current);

    return () => {
      clearTimeout(timerRef.current);
    };
  }, [selected, dsDigger]);

  // linkedChartId handled within the rjsf form; enum injected into schema above

  // handle avatar upload: the FileSelect widget will return base64 string
  // we upload to server and replace value with public URL
  const getUploadFilename = (base64) => {
    const rawId = formData.current && formData.current.id ? formData.current.id : Date.now();
    const mimeType = base64.match(/^data:([^;]+);/i)?.[1] || "image/png";
    const extensionMap = {
      "image/png": "png",
      "image/jpeg": "jpg",
      "image/jpg": "jpg",
      "image/gif": "gif",
      "image/webp": "webp",
      "image/svg+xml": "svg",
    };
    const extension = extensionMap[mimeType] || "png";

    return `${rawId}.${extension}`;
  };

  const handleAvatarUpload = async (base64) => {
    if (!base64) return;
    try {
      const filename = getUploadFilename(base64);
      const res = await fetch('/api/upload-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename, data: base64 }),
      });
      const json = await res.json();
      if (json && json.url) {
        const updated = { ...formData.current, avatar: json.url };
        setFormData({ current: updated });
        handleSendDataUp(updated);
      }
    } catch (e) {
      console.error('avatar upload failed', e);
    }
  };

  const handleSendDataUp = async (data) => {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      const nextDigger = createDigger();
      await nextDigger.updateNode(data);
      sendDataUp(nextDigger.ds);
    }, 500);
  };

  const onChange = async (e) => {
    // fix: if there is no URI for an organisation
    if (e.formData.current.uri?.uri === "") {
      setTimeout(() => {
        e.formData.current.uri = { uri: getURI("organisation") };
        setFormData({ ...e.formData });
        handleSendDataUp({ ...e.formData.current });
        return;
      }, 700);
    }

    const nextFormData = {
      current: {
        ...e.formData.current,
        linkedChartId: e.formData.current.linkedChartId || "",
        layout: {
          ...(e.formData.current.layout || {}),
          positionMode: e.formData.current?.layout?.positionMode || "auto",
        },
      },
    };

    setFormData(nextFormData);
    // if avatar changed as base64, upload it
    if (e.formData.current && e.formData.current.avatar && e.formData.current.avatar.indexOf('base64') !== -1) {
      handleAvatarUpload(e.formData.current.avatar);
      // do not send base64 contents up
      const tmp = { ...nextFormData.current };
      delete tmp.avatar;
      handleSendDataUp({ ...tmp });
      return;
    }

    handleSendDataUp({ ...nextFormData.current });
  };

  const onBlur = async () => {
    // handleSendDataUp(formData.current);
  };

  const getNewNode = () => {
    const selectedLayout = selected?.layout || {};
    const baseX = Number.isFinite(selectedLayout.x) ? selectedLayout.x : 80;
    const baseY = Number.isFinite(selectedLayout.y) ? selectedLayout.y : 40;

    return createExampleOrganisation({
      layout: isFreeLayout
        ? {
            style: "default",
            positionMode: "manual",
            x: baseX + 260,
            y: baseY + 120,
          }
        : undefined,
    });
  };
  const addSiblingNode = async () => {
    clearTimeout(timerRef.current);
    const nextDigger = createDigger();
    const newNode = getNewNode();
    await nextDigger.addSiblings(selected.id, newNode);
    sendDataUp({ ...nextDigger.ds });
    setSelected(newNode);
  };

  const addChildNode = async () => {
    clearTimeout(timerRef.current);
    const nextDigger = createDigger();
    const newNode = getNewNode();
    if (isFreeLayout) {
      nextDigger.addTopLevelNode(newNode);
    } else {
      await nextDigger.addChildren(selected.id, newNode);
    }
    sendDataUp({ ...nextDigger.ds });
    setSelected(newNode);
  };

  const removeNode = async () => {
    clearTimeout(timerRef.current);
    const nextDigger = createDigger();
    const nodeToRemove = await nextDigger.findNodeById(selected.id);
    const removedNodeIds = collectSubtreeNodeIds(nodeToRemove);
    const nextFreeConnections = removeConnectionsForNodeIds(
      nextDigger?.ds?.document?.freeConnections,
      removedNodeIds
    );

    await nextDigger.removeNodes(selected.id);
    sendDataUp({
      ...nextDigger.ds,
      document: {
        ...(nextDigger.ds.document || {}),
        freeConnections: nextFreeConnections,
      },
    });
    setSelected(null);
  };

  // Custom validation function
  const customValidate = (formData, errors) => {
    const validatorName = dsDiggerRef.current?.ds?.settings?.validator;
    return checkErrors(formData, errors, validatorName, "organisation");
  };

  return (
    <div className="tab" id="organisation-tab">
      <AlertModal
        onOkay={removeNode}
        show={removeNodeAlertModalShow}
        onHide={() => setRemoveNodeAlertModalShow(false)}
        title="Organisation entfernen"
        continueButton="Ja, Organisation entfernen"
      >
        Sollen die Informationen dieser Organisation und deren
        Unterorganisationen entfernt werden?
      </AlertModal>
      <Stack direction="horizontal" gap={3}>
        <div>
          {selected && selected.kind && <h3>{selected.kind}</h3>}
          {selected && selected.name && <h2>{selected.name}</h2>}
        </div>
        <Button
          type="button"
          variant="outline-danger"
          className="ms-auto delete-organisation"
          onClick={() => setRemoveNodeAlertModalShow(true)}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            fill="currentColor"
            className="bi bi-trash"
            viewBox="0 0 16 16"
          >
            <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z" />
            <path
              fillRule="evenodd"
              d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"
            />
          </svg>
        </Button>
      </Stack>
      <Form
        schema={schema}
        uiSchema={uiSchema}
        formData={formData}
        onChange={(e) => onChange(e)}
        onBlur={onBlur}
        fields={fields}
        idPrefix={idPrefix}
        ArrayFieldTemplate={ArrayFieldTemplate}
        ObjectFieldTemplate={ObjectFieldTemplate}
        liveValidate
        showErrorList={false}
        validate={customValidate}
      >
        <br />
      </Form>
      <Stack direction="horizontal" gap={3}>
        {!isFreeLayout && (
          <Button type="button" variant="outline-success" onClick={addSiblingNode}>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              fill="currentColor"
              className="bi me-1 bi-arrow-bar-right"
              viewBox="0 0 16 16"
            >
              <path
                fillRule="evenodd"
                d="M6 8a.5.5 0 0 0 .5.5h5.793l-2.147 2.146a.5.5 0 0 0 .708.708l3-3a.5.5 0 0 0 0-.708l-3-3a.5.5 0 0 0-.708.708L12.293 7.5H6.5A.5.5 0 0 0 6 8zm-2.5 7a.5.5 0 0 1-.5-.5v-13a.5.5 0 0 1 1 0v13a.5.5 0 0 1-.5.5z"
              />
            </svg>
            Neue Nebenorganisation
          </Button>
        )}
        <Button type="button" variant="outline-success" onClick={addChildNode}>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            fill="currentColor"
            className="bi me-1 bi-arrow-bar-down"
            viewBox="0 0 16 16"
          >
            <path
              fillRule="evenodd"
              d="M1 3.5a.5.5 0 0 1 .5-.5h13a.5.5 0 0 1 0 1h-13a.5.5 0 0 1-.5-.5zM8 6a.5.5 0 0 1 .5.5v5.793l2.146-2.147a.5.5 0 0 1 .708.708l-3 3a.5.5 0 0 1-.708 0l-3-3a.5.5 0 0 1 .708-.708L7.5 12.293V6.5A.5.5 0 0 1 8 6z"
            />
          </svg>
          {isFreeLayout ? "Node Hinzufügen" : "Neue Suborganisation"}
        </Button>
      </Stack>
    </div>
  );
};
export default OrganisationTab;
