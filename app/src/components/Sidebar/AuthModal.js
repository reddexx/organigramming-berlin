import React, { useState } from "react";
import { Modal, Button, Form, Alert } from "react-bootstrap";

const AuthModal = ({ show, onHide, onLogin, adminPassword }) => {
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);

  const submit = () => {
    const expected = adminPassword ? String(adminPassword).trim() : "";
    const attempt = password ? String(password).trim() : "";
    if (!expected) {
      setError("Kein Passwort gesetzt");
      return;
    }
    if (attempt === expected) {
      setError(null);
      onLogin();
      onHide();
    } else {
      setError("Ungültiges Passwort");
    }
  };

  return (
    <Modal show={show} onHide={onHide} centered>
      <Modal.Header closeButton>
        <Modal.Title>Login</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {error && <Alert variant="danger">{error}</Alert>}
        <Form>
          <Form.Group>
            <Form.Label>Passwort</Form.Label>
            <Form.Control
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Form.Group>
        </Form>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onHide}>
          Abbrechen
        </Button>
        <Button variant="primary" onClick={submit}>
          Anmelden
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

export default AuthModal;
