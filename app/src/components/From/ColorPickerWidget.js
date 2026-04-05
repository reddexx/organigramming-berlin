import React, { useMemo, useState } from "react";
import { Button, Form, Modal } from "react-bootstrap";

const DEFAULT_COLORS = [
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
];

const ColorPickerWidget = (props) => {
  const [show, setShow] = useState(false);
  const currentValue = props.value || "";
  const colors = useMemo(
    () => props.options?.colors || props.uiSchema?.colors || DEFAULT_COLORS,
    [props.options?.colors, props.uiSchema?.colors]
  );

  const setValue = (value) => {
    props.onChange(value);
    setTimeout(() => {
      props.onBlur && props.onBlur(props.id, value);
    }, 50);
  };

  return (
    <div>
      <Form.Label>{props.label}</Form.Label>
      <div className="d-flex align-items-center gap-2">
        <div
          style={{
            width: "2rem",
            height: "2rem",
            borderRadius: "0.35rem",
            border: "1px solid rgba(0, 0, 0, 0.15)",
            backgroundColor: currentValue || "#ffffff",
            backgroundImage: !currentValue
              ? "linear-gradient(45deg, #f1f3f5 25%, transparent 25%, transparent 75%, #f1f3f5 75%, #f1f3f5), linear-gradient(45deg, #f1f3f5 25%, transparent 25%, transparent 75%, #f1f3f5 75%, #f1f3f5)"
              : "none",
            backgroundSize: "12px 12px",
            backgroundPosition: "0 0, 6px 6px",
          }}
        />
        <Button variant="outline-secondary" onClick={() => setShow(true)}>
          Farbe wählen
        </Button>
        {currentValue && (
          <Button variant="outline-danger" onClick={() => setValue("")}>Zurücksetzen</Button>
        )}
      </div>

      <Modal
        show={show}
        onHide={() => setShow(false)}
        centered
        style={{ zIndex: 2105 }}
        backdropClassName="color-picker-modal-backdrop"
      >
        <Modal.Header closeButton>
          <Modal.Title>Hintergrundfarbe auswählen</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div className="mb-3">
            <Form.Label>Freie Farbe</Form.Label>
            <Form.Control
              type="color"
              value={currentValue || "#c41b31"}
              onChange={(e) => setValue(e.target.value)}
            />
          </div>
          <div>
            <Form.Label>Vorgaben</Form.Label>
            <div className="d-flex flex-wrap gap-2 mt-2">
              {colors.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setValue(color)}
                  style={{
                    width: "2rem",
                    height: "2rem",
                    borderRadius: "999px",
                    border:
                      currentValue === color
                        ? "2px solid #212529"
                        : "1px solid rgba(0, 0, 0, 0.15)",
                    backgroundColor: color,
                  }}
                />
              ))}
            </div>
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={() => setShow(false)}>
            Schließen
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};

export default ColorPickerWidget;