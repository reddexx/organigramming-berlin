import React, { useEffect, useState } from "react";
import { Modal, Button, Form, Alert } from "react-bootstrap";

const AuthModal = ({ show, onHide, onLogin, adminPassword }) => {
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);

  useEffect(() => {
    if (show) {
      setPassword("");
      setError(null);
    }
  }, [show]);

  const submit = () => {
    const expected = adminPassword ? String(adminPassword).trim() : "";
    const attempt = password ? String(password).trim() : "";
    if (!expected) {
      setError("Kein Passwort gesetzt");
      return false;
    }
    if (attempt === expected) {
      setError(null);
      onLogin();
      onHide();
      return true;
    } else {
      setError("Ungültiges Passwort");
      return false;
    }
  };

  return (
    <Modal show={show} onHide={onHide} centered>
      <Modal.Header closeButton>
        <Modal.Title>Login</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {error && <Alert variant="danger">{error}</Alert>}
        <Form
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <Form.Group>
            <Form.Label>Passwort</Form.Label>
            <Form.Control
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (error) {
                  setError(null);
                }
              }}
              autoFocus
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
