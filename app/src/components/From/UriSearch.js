import React, { useState } from "react";
import { Form, Button, Collapse } from "react-bootstrap";

const UriSearch = (props) => {
  const { formData, onChange, schema } = props;
  const [open, setOpen] = useState(false);
  const [editURI, setEditURI] = useState(false);

  function unlink(d) {
    let sameAsUris = formData.sameAsUris.filter(
      (item) => item["uriSameAs"] !== d["uriSameAs"]
    );
    const data = {
      uri: formData.uri,
      sameAsUris: sameAsUris,
    };

    onChange(data);
  }

  return (
    <>
      <div>
        <Button
          variant="link"
          className="ps-0"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-controls={schema.title + "-collapse"}
        >
          {open ? (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              fill="currentColor"
              className="bi bi-chevron-up me-1"
              viewBox="0 0 16 16"
            >
              <path
                fillRule="evenodd"
                d="M7.646 4.646a.5.5 0 0 1 .708 0l6 6a.5.5 0 0 1-.708.708L8 5.707l-5.646 5.647a.5.5 0 0 1-.708-.708l6-6z"
              />
            </svg>
          ) : (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              fill="currentColor"
              className="bi bi-chevron-down me-1"
              viewBox="0 0 16 16"
            >
              <path
                fillRule="evenodd"
                d="M1.646 4.646a.5.5 0 0 1 .708 0L8 10.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708z"
              />
            </svg>
          )}
          {schema.title}
        </Button>
        <Collapse in={open}>
          <div>
            {" "}
            <Form.Group className={"org-uri"} style={{ overflow: "auto" }}>
              <Form.Label>{schema.properties.uri.title}</Form.Label>
              <Form.Control
                type="text"
                value={formData.uri}
                onChange={(e) => {
                  let data = { ...formData };
                  data.uri = e.target.value;
                  onChange(data);
                }}
                disabled={!editURI}
              />
              <div
                style={{
                  paddingTop: "0px",
                  fontSize: "12px",
                  display: "flex",
                }}
              >
                <p>{"nur ändern, wenn Sie sich ganz sicher sind"}</p>
                <Form.Check
                  style={{
                    paddingLeft: "5px",
                  }}
                  onChange={(e) => setEditURI(!editURI)}
                  checked={editURI}
                />
              </div>
              {formData?.sameAsUris && (
                <div style={{ marginTop: "20px" }}></div>
              )}
              {formData?.sameAsUris &&
                formData.sameAsUris.map((d, i) => (
                  <div className="same-as" key={"uri-key-" + i}>
                    {d.uriSameAsLabel}
                    <br></br>
                    <a href={d.uriSameAs} target="blank" rel="noreferrer">
                      <small>{d.uriSameAsDescription}</small>
                    </a>

                    <Button
                      variant="link"
                      onClick={() => unlink(d)}
                      title="löschen"
                      className="btn btn-danger btn-sm m-1 btn-light flex-shrink-1"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="16"
                        height="16"
                        fill="currentColor"
                        viewBox="0 0 16 16"
                        style={{ marginBottom: "2px" }}
                      >
                        <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z" />
                        <path d="M4 8a.5.5 0 0 1 .5-.5h7a.5.5 0 0 1 0 1h-7A.5.5 0 0 1 4 8z" />
                      </svg>
                    </Button>
                  </div>
                ))}
              <br></br>
              <br></br>
            </Form.Group>
          </div>
        </Collapse>
      </div>
    </>
  );
};

export default UriSearch;
