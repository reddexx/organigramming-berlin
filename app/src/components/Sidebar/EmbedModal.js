import React, { useMemo, useState } from "react";
import { Modal, Button, Form, InputGroup } from "react-bootstrap";

const EmbedModal = ({ show, onHide }) => {
  const [width, setWidth] = useState(800);
  const [height, setHeight] = useState(600);
  const [copied, setCopied] = useState(false);

  const src = useMemo(() => {
    try {
      return window.location.href;
    } catch (e) {
      return "";
    }
  }, []);

  const embedCode = useMemo(() => {
    const safeSrc = src || "";
    return `<iframe src=\"${safeSrc}\" width=\"${width}\" height=\"${height}\" frameborder=\"0\"></iframe>`;
  }, [src, width, height]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(embedCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      alert("Kopieren fehlgeschlagen: " + e?.message);
    }
  };

  return (
    <Modal show={show} onHide={onHide} size="lg" centered>
      <Modal.Header closeButton>
        <Modal.Title>Embed / Iframe</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Form.Group>
          <Form.Label>Vorschau</Form.Label>
          <div style={{ border: "1px solid #ddd", padding: 12, marginBottom: 12 }}>
            <div dangerouslySetInnerHTML={{ __html: embedCode }} />
          </div>
        </Form.Group>

        <InputGroup className="mb-3">
          <InputGroup.Text>Width</InputGroup.Text>
          <Form.Control
            type="number"
            value={width}
            onChange={(e) => setWidth(Number(e.target.value || 0))}
          />
          <InputGroup.Text>Height</InputGroup.Text>
          <Form.Control
            type="number"
            value={height}
            onChange={(e) => setHeight(Number(e.target.value || 0))}
          />
        </InputGroup>

        <Form.Group>
          <Form.Label>Embed-Code</Form.Label>
          <Form.Control as="textarea" rows={3} readOnly value={embedCode} />
        </Form.Group>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onHide}>
          Schließen
        </Button>
        <Button variant="primary" onClick={copy}>
          {copied ? "Kopiert" : "Code kopieren"}
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

export default EmbedModal;
